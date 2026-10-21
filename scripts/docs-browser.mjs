// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/*
 * Drives the app in headless Chrome, for the scripts that work from the docs: the screenshots
 * (docs-screenshots.mjs) and the walkthrough that follows the tutorials click by click
 * (docs-walkthrough.mjs).
 *
 * It starts the dev server and a headless Chrome, and hands a script a `Page` with what it needs:
 * the app's own modules (the dev server gives the page the same instances the app is running),
 * staged MIDI, real mouse and keyboard input, and cropped, annotated captures.
 *
 * Needs Chrome or Chromium: set CHROME_PATH if it isn't at the usual macOS location. No packages
 * beyond the project's own — Node's WebSocket speaks the DevTools protocol directly.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const OUT = join(ROOT, "docs", "images");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VITE_PORT = 5199;
const CDP_PORT = 9333;
const WIDTH = 1280;
const HEIGHT = 900;
const SCALE = 2;

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Terminal colour codes, which Vite wraps its output in — port number included. */
// eslint-disable-next-line no-control-regex
const ANSI_COLOUR = /\x1b\[[0-9;]*m/g;

// ---------------------------------------------------------------------------------------------
// Processes

export function startVite() {
  return new Promise((resolve, reject) => {
    const vite = spawn(join(ROOT, "node_modules", ".bin", "vite"), ["--port", String(VITE_PORT), "--strictPort"], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      vite.kill();
      reject(new Error("The dev server didn't start within 20s"));
    }, 20_000);
    vite.stdout.on("data", (chunk) => {
      // Vite colours its output, port number included, so the escape codes come off first.
      if (String(chunk).replace(ANSI_COLOUR, "").includes(`localhost:${VITE_PORT}`)) {
        clearTimeout(timer);
        resolve(vite);
      }
    });
    let errors = "";
    vite.stderr.on("data", (chunk) => (errors += String(chunk)));
    vite.on("exit", (code) => reject(new Error(`The dev server exited (${code}): ${errors.trim() || "no output"}`)));
  });
}

export async function startChrome() {
  // A Chrome left over from an earlier run would answer on the port instead of this one, and its
  // saved snapshots and MIDI state would end up in the pictures. Refuse rather than share it.
  const leftover = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then(
    () => true,
    () => false,
  );
  if (leftover)
    throw new Error(
      `Something is already listening on port ${CDP_PORT}: a Chrome left from an earlier run? Quit it first.`,
    );
  const profile = await mkdtemp(join(tmpdir(), "pacer-docs-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      return { chrome, profile };
    } catch {
      await wait(200);
    }
  }
  throw new Error(`Chrome didn't start. Set CHROME_PATH (tried ${CHROME}).`);
}

// ---------------------------------------------------------------------------------------------
// A minimal DevTools protocol client

export async function connect() {
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  return { send, close: () => ws.close() };
}

/** The page, with what a scene needs: set up state, find things, press things, take pictures. */
export class Page {
  constructor(cdp) {
    this.cdp = cdp;
    this.height = HEIGHT;
  }

  async open() {
    await this.cdp.send("Runtime.enable");
    await this.cdp.send("Page.enable");
    await this.resize(HEIGHT);
    await this.cdp.send("Page.navigate", { url: `http://localhost:${VITE_PORT}/` });
    await wait(2500);
    // The app's own modules, from the dev server: the same instances the page is running.
    await this.eval(`(async () => {
      window.__docs = {
        store: (await import("/src/store/pacerStore.ts")).usePacerStore,
        editing: await import("/src/pacer/editing/index.ts"),
        analysis: await import("/src/pacer/analysis/index.ts"),
        authoring: await import("/src/pacer/authoring/index.ts"),
        constants: await import("/src/pacer/protocol/constants.ts"),
        factory: await import("/src/pacer/factoryDefaults.ts"),
        compile: await import("/src/test/compileMachine.ts"),
      };
    })()`);
  }

  async resize(height) {
    this.height = height;
    await this.cdp.send("Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height,
      deviceScaleFactor: SCALE,
      mobile: false,
    });
  }

  async eval(expression) {
    const r = await this.cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "evaluate threw");
    return r.result.value;
  }

  /** Runs `body` in the page with `d` bound to the app's modules (see `open`). */
  async app(body) {
    const value = await this.eval(`(async (d) => { ${body} })(window.__docs)`);
    await wait(250);
    return value;
  }

  /**
   * MIDI as it looks with gear plugged in: a Quad Cortex to send to, and a Pacer on USB that
   * answers the identity request the way a real one does. Headless Chrome has no MIDI devices, so
   * these are the test suite's fakes, handed to the store's own connect — the screens they produce
   * are the app's, only the ports are staged.
   */
  async stageMidi({ output = "Quad Cortex" } = {}) {
    await this.app(`
      const { FakeMidiAccess, FakeOutput, FakeInput } = await import("/src/midi/__tests__/fakeMidi.ts");
      const rig = new FakeOutput("rig", ${JSON.stringify(output)});
      const pacerOut = new FakeOutput("pacer-out", "PACER MIDI1");
      const pacerIn = new FakeInput("pacer-in", "PACER MIDI1");
      const identity = [0xf0, 0x7e, 0x7f, 0x06, 0x02, 0x00, 0x01, 0x77, 0x67, 0x48, 0x51, 0x40, 0x30, 0x31, 0x30, 0x31, 0xf7];
      // A Pacer that answers who it is, and a full-dump request with the factory set.
      const { encodeSysexMessages } = await import("/src/pacer/protocol/encode.ts");
      const dump = encodeSysexMessages(d.factory.loadFactoryDefaults());
      pacerOut.onSend = (data) => {
        if (data[1] === 0x7e && data[4] === 0x01) setTimeout(() => pacerIn.receive(identity), 20);
        if (data[5] === 0x02 && data[6] === 0x7f) setTimeout(() => dump.forEach((m) => pacerIn.receive(m)), 20);
      };
      await d.store.getState().connectMidi(async () => new FakeMidiAccess([rig, pacerOut], true, [pacerIn]));
      d.store.getState().selectMidiOutput("rig");
    `);
    await wait(400);
  }

  /**
   * The factory set with a looper written into bank A, the way the tutorial builds it: MAIN0 and
   * MAIN1 each enter LOOPR, which comes back — so LOOPR is two presets, one state.
   */
  async loadLooperExample() {
    await this.app(`
      const C = d.constants.ControlId;
      const T = d.constants.SwitchMessageType;
      const note = (n) => ({ [C.Stompswitch1]: { steps: { 1: { channel: 0, msgType: T.Note, data: [n, 127, 0], active: true } }, led: {} } });
      const compiled = d.compile.compileMachine({ states: [
        { id: "m0", name: "MAIN0", body: note(60), transitions: [{ controlId: C.StompswitchA, stepNumber: 1, to: { kind: "state", id: "loop" } }] },
        { id: "m1", name: "MAIN1", body: note(61), transitions: [{ controlId: C.StompswitchA, stepNumber: 1, to: { kind: "state", id: "loop" } }] },
        { id: "loop", name: "LOOPR", body: note(99), transitions: [{ controlId: C.StompswitchA, stepNumber: 1, to: { kind: "return" } }] },
      ] });
      if (!compiled.ok) throw new Error(compiled.error);
      const factory = d.factory.loadFactoryDefaults();
      const presets = { ...factory.presets, ...compiled.config.presets };
      // As on a real device, the working copy (slot 0) is the loaded preset, A1.
      presets[0] = { ...structuredClone(presets[1]), index: 0 };
      const config = { ...factory, presets };
      d.store.getState().loadConfig(config, "Looper example");
    `);
  }

  /**
   * The tutorials' looper, built from the factory set the way the tutorials do it by hand.
   * Stage 1: LOOPR in C1 — the looper's functions on 1-6 and B, A going back to A1 — and A1's A
   * leading to it. Stage 2 adds A2 as a second way in, routed on the map, its copy in D6.
   */
  async loadLooperTutorial(stage) {
    await this.app(`
      const C = d.constants.ControlId;
      const T = d.constants.SwitchMessageType;
      const e = d.editing;
      let c = d.factory.loadFactoryDefaults();
      c = e.renamePreset(e.clearPreset(c, 13), 13, "LOOPR");
      const pads = [
        [C.Stompswitch1, 53, 3], [C.Stompswitch2, 54, 13], [C.Stompswitch3, 56, 7],
        [C.Stompswitch4, 51, 17], [C.Stompswitch5, 55, 21], [C.Stompswitch6, 49, 15],
        [C.StompswitchB, 52, 5],
      ];
      for (const [id, cc, colour] of pads) {
        c = e.setStepType(c, 13, id, 1, "switch", T.CcTrigger);
        c = e.updateStep(c, 13, id, 1, { data: [cc, 127, 0], channel: 0 });
        c = e.updateStepLed(c, 13, id, 1, { activeColor: colour, inactiveColor: colour + 1 });
      }
      for (const [from, to] of [[13, 1], [1, 13]]) {
        c = e.setJump(c, from, C.StompswitchA, 1, to);
        // As the tutorial says: White for the colour. A Preset Select never shows its second.
        c = e.updateStepLed(c, from, C.StompswitchA, 1, { activeColor: 23 });
      }
      if (${stage} >= 2) {
        // Drag PRGM2 -> LOOPR on A (free: LOOPR's A still goes to A1), then make LOOPR's A go
        // back to wherever it was entered from, which takes a copy, in D6.
        c = e.clearPreset(c, 24);
        const edit = (change, into) => {
          const result = d.authoring.editRoute(c, change, into);
          if (!result.ok) throw new Error(result.error);
          c = result.config;
        };
        const id = (slot) => d.analysis.stateContaining(d.analysis.machineOf(c), slot).state.id;
        edit({ fromStateId: id(2), controlId: C.StompswitchA, stepNumber: 1, to: { kind: "state", id: id(13) }, replace: true });
        edit({ fromStateId: id(13), controlId: C.StompswitchA, stepNumber: 1, to: { kind: "return" } }, [24]);
        if (d.analysis.machineOf(c).members[id(13)].length !== 2) throw new Error("stage 2 didn't make a second LOOPR");
      }
      // As on a real device, the working copy (slot 0) is the loaded preset, A1.
      c = { ...c, presets: { ...c.presets, 0: { ...structuredClone(c.presets[1]), index: 0 } } };
      d.store.getState().loadConfig(c, "Looper tutorial");
    `);
  }

  /** Back to the factory defaults in Simulate, nothing open, nothing remembered. */
  async reset() {
    await this.key("Escape");
    await this.app(`
      const s = d.store.getState();
      s.loadConfig(d.factory.loadFactoryDefaults(), "Factory defaults");
      s.setUiMode("simulate");
      s.setEditScope("state");
    `);
    await this.resize(HEIGHT);
    await this.eval("window.scrollTo(0, 0); document.querySelector('.app-scroll')?.scrollTo(0, 0)");
  }

  /**
   * The box of the first element matching `selector` — or, given `text`, the innermost one whose
   * text includes it (every ancestor contains the text too, up to the whole app). Scrolls it into
   * view first.
   */
  async rect(selector, text, { exact = false } = {}) {
    const match =
      text === undefined
        ? "true"
        : exact
          ? `e.textContent.trim() === ${JSON.stringify(text)}`
          : `e.textContent.includes(${JSON.stringify(text)})`;
    const r = await this.eval(`(() => {
      const all = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .filter((e) => ${match})
        .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
      const area = (e) => { const b = e.getBoundingClientRect(); return b.width * b.height; };
      const el = ${text === undefined ? "all[0]" : "all.sort((a, b) => area(a) - area(b))[0]"};
      if (!el) return null;
      // Below the fold of the app's scroll container, a capture would be clipped to nothing.
      el.scrollIntoView({ block: "nearest", behavior: "instant" });
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    })()`);
    if (!r) throw new Error(`Nothing on the page matches ${selector}${text ? ` with "${text}"` : ""}`);
    return r;
  }

  /** The boxes of every visible element matching `selector` — to crop around a group of things. */
  async rects(selector) {
    return this.eval(`[...document.querySelectorAll(${JSON.stringify(selector)})]
      .map((e) => e.getBoundingClientRect())
      .filter((b) => b.width > 0 && b.height > 0)
      .map((b) => ({ x: b.x, y: b.y, width: b.width, height: b.height }))`);
  }

  async key(key) {
    for (const type of ["keyDown", "keyUp"]) {
      await this.cdp.send("Input.dispatchKeyEvent", {
        type,
        key,
        code: key,
        windowsVirtualKeyCode: key === "Escape" ? 27 : 0,
      });
    }
    await wait(150);
  }

  /** A real mouse click at the middle of an element: React Aria listens for pointer events. */
  async click(selector, text) {
    const r = await this.rect(selector, text);
    await this.pointClick(r.x + r.width / 2, r.y + r.height / 2);
  }

  /** A real click at a point on the page, for things with no element of their own to aim at. */
  async pointClick(x, y) {
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await this.cdp.send("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: "left",
        buttons: type === "mouseReleased" ? 0 : 1,
        clickCount: 1,
        pointerType: "mouse",
      });
    }
    await wait(350);
  }

  /** The centre of one of a map state's connection dots (`s-r`, `t-l`…), found by the state's name. */
  async handle(name, id) {
    return this.eval(`(() => {
      const node = [...document.querySelectorAll(".react-flow__node")].find((n) => n.textContent.includes(${JSON.stringify(name)}));
      // The whole map, not the node: a drag takes two handles, and scrolling to the second
      // mustn't move the first. The panel under the map can leave it scrolled out of view.
      node.closest(".react-flow").scrollIntoView({ block: "nearest", behavior: "instant" });
      const b = node.querySelector('[data-handleid="${id}"]').getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    })()`);
  }

  /** A real drag, in steps, from one point to another (React Flow needs the intermediate moves). */
  async drag(from, to) {
    const ev = (type, x, y) =>
      this.cdp.send("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: "left",
        buttons: type === "mouseReleased" ? 0 : 1,
        clickCount: 1,
        pointerType: "mouse",
      });
    await ev("mousePressed", from.x, from.y);
    for (let i = 1; i <= 8; i++) {
      await ev("mouseMoved", from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
      await wait(20);
    }
    await ev("mouseReleased", to.x, to.y);
    await wait(500);
  }

  /**
   * Saves a picture to docs/images/<name>.png.
   *
   * `around` is one box or several (their union is taken), widened by `pad`; leave it out for the
   * whole viewport. `callouts` are numbered markers placed by boxes — `{ n, box, at }`, `at` being
   * "below" (the default), "above", "left", "right", "corner" (on the top-right corner), or
   * "inside-top-left"/"-top-right"/"-right" —
   * drawn over the page for the length of the capture.
   */
  async shot(name, { around, pad = 12, callouts = [] } = {}) {
    // Out of the way first: the mouse rests wherever a scene last clicked, and anything under it
    // shows its hover style, so a picture would depend on an earlier scene's clicks.
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
    await wait(100);
    if (callouts.length > 0) {
      await this.eval(`(() => {
        const layer = document.createElement("div");
        layer.id = "docs-callouts";
        layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
        // Where each marker goes, relative to its box: beside it for small controls, inside a
        // corner for big regions. Clamped to the page, so a marker can never fall off the picture.
        const place = {
          below: (b) => [b.x + b.width / 2, b.y + b.height + 14],
          above: (b) => [b.x + b.width / 2, b.y - 14],
          left: (b) => [b.x - 16, b.y + b.height / 2],
          right: (b) => [b.x + b.width + 16, b.y + b.height / 2],
          "inside-top-left": (b) => [b.x + 20, b.y + 20],
          "inside-top-right": (b) => [b.x + b.width - 20, b.y + 20],
          "inside-right": (b) => [b.x + b.width - 22, b.y + b.height / 2],
          // On the control's own top-right corner, the way the app's badges sit on theirs: for
          // controls packed in a row, where any side would also be beside a neighbour.
          corner: (b) => [b.x + b.width - 2, b.y + 2],
        };
        for (const c of ${JSON.stringify(callouts)}) {
          let [x, y] = place[c.at ?? "below"](c.box);
          x = Math.min(Math.max(x, 14), innerWidth - 14);
          y = Math.min(Math.max(y, 14), innerHeight - 14);
          const dot = document.createElement("div");
          dot.textContent = String(c.n);
          dot.style.cssText = [
            "position:absolute", "width:24px", "height:24px", "border-radius:12px",
            "background:#facc15", "color:#111", "font:700 13px/24px system-ui,sans-serif",
            "text-align:center", "box-shadow:0 0 0 2px #111,0 2px 6px rgba(0,0,0,.6)",
            "left:" + (x - 12) + "px", "top:" + (y - 12) + "px",
          ].join(";");
          layer.appendChild(dot);
        }
        document.body.appendChild(layer);
      })()`);
    }

    let clip;
    if (around) {
      const boxes = Array.isArray(around) ? around : [around];
      const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
      const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
      const x1 = Math.min(WIDTH, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
      const y1 = Math.min(this.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
      clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0, scale: 1 };
    }
    const { data } = await this.cdp.send("Page.captureScreenshot", { format: "png", ...(clip ? { clip } : {}) });
    await this.eval(`document.getElementById("docs-callouts")?.remove()`);
    await writeFile(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
    console.log(`  ${name}.png`);
  }
}

/** The smallest box around several boxes — to mark a group of controls as one thing. */
export function union(boxes) {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}

/**
 * Runs `fn(page)` against the app in a fresh headless Chrome and dev server, and shuts both down
 * afterwards however it ends.
 */
export async function withApp(fn) {
  const vite = await startVite();
  const { chrome, profile } = await startChrome();
  const cdp = await connect();
  try {
    const page = new Page(cdp);
    await page.open();
    return await fn(page);
  } finally {
    cdp.close();
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    vite.kill();
    await exited;
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
