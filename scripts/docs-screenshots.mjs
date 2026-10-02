#!/usr/bin/env node
/*
 * Regenerates the screenshots in docs/images.
 *
 *   pnpm docs:screenshots            every scene
 *   pnpm docs:screenshots looper     only scenes whose name contains "looper"
 *
 * The docs show the app as it is, so their pictures have to come from the app as it is. This
 * starts the dev server and a headless Chrome, sets each scene up through the app's own store (the
 * dev server hands the page the same module instances the app is running, so a scene is built with
 * the app's real edits rather than by imitating them), and captures each shot cropped to the thing
 * it explains. The numbered callouts in the reference are drawn here too, on top of the page, so
 * they stay where they belong when the layout moves.
 *
 * Needs Chrome or Chromium: set CHROME_PATH if it isn't at the usual macOS location. No packages
 * beyond the project's own — Node's WebSocket speaks the DevTools protocol directly.
 */

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "docs", "images");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VITE_PORT = 5199;
const CDP_PORT = 9333;
const WIDTH = 1280;
const HEIGHT = 900;
const SCALE = 2;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Terminal colour codes, which Vite wraps its output in — port number included. */
// eslint-disable-next-line no-control-regex
const ANSI_COLOUR = /\x1b\[[0-9;]*m/g;

// ---------------------------------------------------------------------------------------------
// Processes

function startVite() {
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

async function startChrome() {
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

async function connect() {
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
class Page {
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
        c = e.updateStepLed(c, from, C.StompswitchA, 1, { activeColor: 23, inactiveColor: 24 });
      }
      if (${stage} >= 2) {
        c = e.clearPreset(c, 24);
        const m = d.analysis.machineOf(c);
        const result = d.authoring.editRoute(c, {
          fromStateId: d.analysis.stateContaining(m, 2).state.id,
          controlId: C.StompswitchA,
          stepNumber: 1,
          toStateId: d.analysis.stateContaining(m, 13).state.id,
          asReturn: true,
          replace: true,
        }, [24]);
        if (!result.ok) throw new Error(result.error);
        c = result.config;
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
function union(boxes) {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}

// ---------------------------------------------------------------------------------------------
// Scenes. Each one starts from `reset()` and leaves whatever it likes behind.

const scenes = {
  /** The whole window, its regions numbered: the reference's first picture. */
  async "app-window"(p) {
    await p.resize(1000);
    const callouts = [
      { n: 1, box: await p.rect('[title="Open configurations and the Pacer connection"] button'), at: "corner" },
      { n: 2, box: await p.rect('[role="radiogroup"]'), at: "corner" },
      { n: 3, box: await p.rect("a", "Docs"), at: "corner" },
      { n: 4, box: await p.rect("header button", "Connect MIDI"), at: "corner" },
      { n: 5, box: await p.rect("header + div"), at: "inside-right" },
      { n: 6, box: await p.rect('[aria-label^="Pacer faceplate"]'), at: "inside-top-left" },
      { n: 7, box: await p.rect("div", "Footswitch 1"), at: "above" },
      { n: 8, box: await p.rect('[role="log"]'), at: "inside-top-right" },
    ];
    await p.shot("app-window", { callouts });
  },

  /** The header once MIDI is granted and a Pacer is on USB. */
  async "header-connected"(p) {
    await p.stageMidi();
    await p.shot("header-connected", { around: await p.rect("header"), pad: 0 });
  },

  /** The faceplate, its parts numbered. */
  async faceplate(p) {
    const plate = await p.rect('[aria-label^="Pacer faceplate"]');
    const callouts = [
      { n: 1, box: await p.rect('[aria-label^="Preset button"]'), at: "corner" },
      { n: 2, box: await p.rect('[aria-label^="Switch A:"]'), at: "corner" },
      { n: 3, box: await p.rect('[aria-label^="Switch 1:"]'), at: "corner" },
      { n: 4, box: await p.rect("*", "hold: preset select", { exact: true }), at: "left" },
      { n: 5, box: await p.rect('[data-testid="display-line1"]'), at: "left" },
      { n: 6, box: await p.rect('[aria-label$="choose another"]'), at: "inside-top-left" },
    ];
    await p.shot("faceplate", { around: plate, pad: 4, callouts });
  },

  /** One front-row switch up close, lit, its lights and labels numbered. */
  async "switch-anatomy"(p) {
    await p.app(`d.store.getState().press(${0x0d}); d.store.getState().release(${0x0d})`);
    const sw = await p.rect('[aria-label^="Switch 1:"]');
    const at = (f) => ({ x: sw.x, y: sw.y + sw.height * f, width: sw.width, height: 1 });
    const hint = await p.rect("*", "PC0", { exact: true });
    const below = { x: sw.x, y: sw.y, width: sw.width, height: hint.y + hint.height + 40 - sw.y };
    const callouts = [
      { n: 1, box: at(0.12), at: "left" },
      { n: 2, box: at(0.28), at: "left" },
      { n: 3, box: at(0.41), at: "left" },
      { n: 4, box: at(0.72), at: "left" },
      { n: 5, box: hint, at: "left" },
    ];
    await p.shot("switch-anatomy", { around: below, pad: 28, callouts });
  },

  /** Holding [Preset]: the firmware's preset select, waiting for a bank and a number. */
  async "preset-select-mode"(p) {
    await p.app(`d.store.getState().presetButtonDown()`);
    await wait(2400);
    // Flashing lights, frozen in their lit phase: a still caught mid-blink shows them dark, and
    // the page says they flash.
    await p.eval(`document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0; })`);
    const plate = await p.rect('[aria-label^="Pacer faceplate"]');
    await p.shot("preset-select-mode", { around: plate, pad: 4 });
    await p.app(`d.store.getState().presetButtonUp()`);
  },

  /** The preset chooser, opened from the display: by bank, then by state. */
  async "preset-chooser"(p) {
    await p.loadLooperExample();
    // An edit, so the chooser has an "edited" mark to show.
    await p.app(`d.store.getState().applyEdit((c) => d.editing.renamePreset(c, 7, "HELIX"))`);
    await p.click('[aria-label$="choose another"]');
    const popover = async () => p.rect('[role="dialog"]');
    await p.shot("preset-chooser-banks", { around: await popover(), pad: 8 });
    await p.click('[role="radio"]', "By state");
    await p.shot("preset-chooser-states", { around: await popover(), pad: 8 });
    await p.key("Escape");
  },

  /** The rear jacks: footswitches as buttons, expression pedals as sliders. */
  async "rear-jacks"(p) {
    await p.app(`d.store.getState().movePedal(${0x36}, 0.6)`);
    const jacks = await p.rects('[aria-label$="heel to toe"], button[aria-label^="Switch Footswitch"]');
    await p.shot("rear-jacks", { around: jacks, pad: 16 });
  },

  /** The output log after a few presses: a Program Change, a preset change, and a preset's load MIDI. */
  async "output-log"(p) {
    await p.resize(1300);
    await p.stageMidi();
    await p.app(`
      const s = d.store.getState();
      const tap = (id) => { s.press(id); s.release(id); };
      tap(${0x0e});   // switch 2: Program Change 1
      tap(${0x17});   // switch D: next preset
      tap(${0x0d});   // switch 1 on the new preset
    `);
    const log = await p.rect('[role="log"]');
    const heading = await p.rect("h2", "Output");
    await p.shot("output-log", { around: [log, heading], pad: 10 });
  },

  /** Program mode's faceplate: every programmable control wears a pencil. */
  async "program-faceplate"(p) {
    await p.app(`d.store.getState().setUiMode("program")`);
    await p.shot("program-faceplate", { around: await p.rect('[aria-label^="Pacer faceplate"]'), pad: 14 });
  },

  /** Switch 1 opened for programming: a CC toggle with its colours, and a second step. */
  async "switch-editor"(p) {
    await p.resize(1500);
    await p.app(`
      const s = d.store.getState();
      const e = d.editing;
      const T = d.constants.SwitchMessageType;
      const SW = ${0x0d};
      s.setUiMode("program");
      s.applyEdit((c) => {
        let x = e.setStepType(c, 1, SW, 1, "switch", T.CcToggle);
        x = e.updateStep(x, 1, SW, 1, { data: [52, 127, 0] });
        x = e.updateStepLed(x, 1, SW, 1, { activeColor: 13, inactiveColor: 3, position: 0 });
        x = e.setStepType(x, 1, SW, 2, "switch", T.ProgramAndBank);
        return e.updateStep(x, 1, SW, 2, { data: [5, 0, 0] });
      });
      s.selectControl(SW);
    `);
    const step1 = 'section[aria-label="Step 1"]';
    const callouts = [
      { n: 1, box: await p.rect('[aria-label="Programming Stomp 1"] [aria-label^="Preset:"]'), at: "corner" },
      { n: 2, box: union(await p.rects('[aria-label^="Program "]')), at: "below" },
      { n: 3, box: await p.rect('[aria-label="Back to faceplate"]'), at: "left" },
      { n: 4, box: await p.rect('[aria-label^="Try 1:"]'), at: "left" },
      { n: 5, box: await p.rect('[aria-label="Control mode"]'), at: "corner" },
      { n: 6, box: await p.rect(`${step1} button`), at: "above" },
      { n: 7, box: await p.rect(`${step1} *`, "Channel", { exact: true }), at: "above" },
      { n: 8, box: await p.rect(`${step1} *`, "CC#", { exact: true }), at: "left" },
      { n: 9, box: await p.rect(`${step1} [aria-label="Light"]`), at: "corner" },
      { n: 10, box: await p.rect(`${step1} [aria-label="Lit by"]`), at: "corner" },
      { n: 11, box: await p.rect('button[aria-label^="While CC 52 = 127"]'), at: "left" },
      { n: 12, box: await p.rect('[aria-label="Remove step 2"]'), at: "left" },
      { n: 13, box: await p.rect("button", "+ Add step"), at: "left" },
    ];
    await p.shot("switch-editor", { around: await p.rect('[aria-label="Programming Stomp 1"]'), pad: 16, callouts });

    // The colour picker, opened on the first colour.
    await p.click('button[aria-label^="While CC 52 = 127"]');
    await p.shot("colour-picker", { around: await p.rect('[role="dialog"]'), pad: 10 });
    await p.key("Escape");
  },

  /** Renaming on the display: the name line opens for typing. */
  async rename(p) {
    await p.app(`d.store.getState().setUiMode("program")`);
    await p.click('[aria-label^="Rename preset"]');
    const display = await p.rects('[data-testid="display-line1"], [data-testid="display-line2"]');
    await p.shot("rename", { around: display, pad: 30 });
    await p.key("Escape");
  },

  /** The preset's own panel: the MIDI it sends when it loads, and clearing it. */
  async "preset-panel"(p) {
    await p.app(`
      const s = d.store.getState();
      const T = d.constants.PresetMidiMessageType;
      s.setUiMode("program");
      s.applyEdit((c) => d.editing.updatePresetMidi(d.editing.setPresetMidiType(c, 1, 1, T.ProgramAndBank), 1, 1, { data: [5, 0, 0], channel: 1 }));
    `);
    await p.shot("preset-panel", { around: await p.rect('section[aria-label="Preset settings"]'), pad: 10 });
  },

  /** On one of a state's presets: edits go to all of them, and the app says so. */
  async "edit-scope"(p) {
    await p.loadLooperExample();
    await p.app(`
      const s = d.store.getState();
      s.jumpToPreset(3);
      s.setUiMode("program");
    `);
    await p.shot("edit-scope-bar", { around: await p.rects("header + div > *, header + div > * > *") });
    const display = await p.rects('[data-testid="display-line1"], [data-testid="display-line2"]');
    await p.shot("edit-scope-display", { around: display, pad: 30 });
    await p.shot("edit-scope-note", { around: await p.rect("p", "is one of 2 presets"), pad: 10 });
  },

  /** The preset map, on the looper example: two ways in, one looper that comes back. */
  async "preset-map"(p) {
    await p.loadLooperExample();
    await p.app(`d.store.getState().setUiMode("map")`);
    await wait(800);
    const node = (name) => p.rect(".react-flow__node", name);
    const map = await p.rect('section[aria-label="Preset map"]');
    const labels = await p.eval(`[...document.querySelectorAll(".react-flow__edgelabel-renderer div")]
      .filter((e) => e.textContent.trim() === "A")
      .map((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })
      .sort((a, b) => b.y - a.y)`);
    await p.shot("preset-map", {
      around: { ...map, height: (await node("SEQNC")).y + 60 - map.y },
      pad: 8,
      callouts: [
        { n: 1, box: await p.rect('[role="radiogroup"]', "Designed routes"), at: "corner" },
        { n: 2, box: await node("MAIN0"), at: "left" },
        { n: 3, box: labels[0], at: "below" },
        { n: 4, box: await p.rect(".react-flow__node div", "2 presets · one state"), at: "right" },
        { n: 5, box: await p.rect(".react-flow__node div", "A returns"), at: "below" },
        { n: 6, box: await p.rect('[aria-label="Program LOOPR"]'), at: "right" },
        { n: 7, box: await node("NOTES"), at: "left" },
      ],
    });

    // An existing route: MAIN0's way into the looper.
    // The label lets clicks through to the route under it, which is what opens.
    const a = labels[0];
    await p.pointClick(a.x + a.width / 2, a.y + a.height / 2);
    await p.shot("route-existing", { around: await p.rect('[role="dialog"]'), pad: 8 });
    await p.key("Escape");

    // A state's presets, below the map.
    await p.click(".react-flow__node", "LOOPR");
    await p.shot("state-details", { around: await p.rect('section[aria-label^="LOOPR"]'), pad: 8 });
    await p.click("button", "Close");
  },

  /**
   * A second way into a looper that so far has one: whether it comes back is the question the
   * presets can't answer, and answering "comes back" costs a preset.
   */
  async "route-choice"(p) {
    await p.app(`
      const C = d.constants.ControlId;
      const T = d.constants.SwitchMessageType;
      const note = (n) => ({ [C.Stompswitch1]: { steps: { 1: { channel: 0, msgType: T.Note, data: [n, 127, 0], active: true } }, led: {} } });
      const compiled = d.compile.compileMachine({ states: [
        { id: "m0", name: "MAIN0", body: note(60), transitions: [{ controlId: C.StompswitchA, stepNumber: 1, to: { kind: "state", id: "loop" } }] },
        { id: "m1", name: "MAIN1", body: note(61), transitions: [] },
        { id: "loop", name: "LOOPR", body: note(99), transitions: [{ controlId: C.StompswitchA, stepNumber: 1, to: { kind: "return" } }] },
      ] });
      if (!compiled.ok) throw new Error(compiled.error);
      const factory = d.factory.loadFactoryDefaults();
      const presets = { ...factory.presets, ...compiled.config.presets };
      presets[0] = { ...structuredClone(presets[1]), index: 0 };
      const s = d.store.getState();
      s.loadConfig({ ...factory, presets }, "Looper example");
      // A spare slot for the copy to go in.
      s.applyEdit((c) => d.editing.clearPreset(c, 24));
      s.setUiMode("map");
    `);
    await wait(800);
    await p.drag(await p.handle("MAIN1", "s-r"), await p.handle("LOOPR", "t-l"));
    await p.click('[role="radio"]', "Comes back here");
    await p.shot("route-choice", { around: await p.rect('[role="dialog"]'), pad: 8 });
    await p.key("Escape");
  },

  /** The device drawer with a few snapshots in it, and the Save and Send dialogs. */
  async devices(p) {
    await p.stageMidi();
    await p.app(`
      const s = d.store.getState();
      await s.pullFromPacer();
      const { encodeSysex } = await import("/src/pacer/protocol/encode.ts");
      s.importSyxFile("looper-from-claude.syx", encodeSysex(d.factory.loadFactoryDefaults()));
      s.setDeviceDrawerOpen(true);
    `);
    await wait(600);
    const drawer = await p.rect('[role="dialog"]');
    const list = await p.rect('ul[aria-label="Saved configurations"]');
    await p.shot("device-drawer", {
      around: { ...drawer, height: list.y + list.height + 36 - drawer.y },
      pad: 0,
      callouts: [
        { n: 1, box: await p.rect("button", "Pull from Pacer"), at: "corner" },
        { n: 2, box: await p.rect("button", "Import .syx"), at: "corner" },
        {
          n: 3,
          box: union(await p.rects('[role="dialog"] [aria-label^="Pacer"], [role="dialog"] button[aria-haspopup]')),
          at: "right",
        },
        { n: 4, box: await p.rect("span", "Firmware"), at: "right" },
        { n: 5, box: await p.rect("li", "Factory defaults"), at: "inside-right" },
        { n: 6, box: await p.rect("li", "looper-from-claude"), at: "corner" },
        {
          n: 7,
          box: union(await p.rects('ul[aria-label="Saved configurations"] li:last-child > div button')),
          at: "below",
        },
      ],
    });
    await p.key("Escape");

    // An edit, so Save and Send have something to do.
    await p.app(`
      const s = d.store.getState();
      s.setUiMode("program");
      s.applyEdit((c) => d.editing.renamePreset(c, 1, "HOME"));
    `);
    await p.click("button", "Save…");
    await p.shot("save-dialog", { around: await p.rect('[role="dialog"]'), pad: 8 });
    await p.key("Escape");
    await p.click("button", "Send to Pacer…");
    await p.shot("send-dialog", { around: await p.rect('[role="dialog"]'), pad: 8 });
    await p.key("Escape");
  },

  /** Tutorial 1: a looper preset in C1, programmed by hand, and the way in from A1. */
  async "tutorial-1"(p) {
    await p.resize(1500);
    await p.loadLooperTutorial(1);
    await p.app(`
      const s = d.store.getState();
      s.jumpToPreset(13);
      s.setUiMode("program");
      s.selectControl(d.constants.ControlId.Stompswitch1);
    `);
    await p.shot("t1-loopr-switch-1", { around: await p.rect('[aria-label="Programming Stomp 1"]'), pad: 12 });
    await p.app(`
      const s = d.store.getState();
      s.jumpToPreset(1);
      s.selectControl(d.constants.ControlId.StompswitchA);
    `);
    await p.shot("t1-a1-switch-a", { around: await p.rect('section[aria-label="Step 1"]'), pad: 12 });
    await p.app(`
      const s = d.store.getState();
      s.selectControl(undefined);
      s.setUiMode("simulate");
      s.jumpToPreset(13);
    `);
    await p.shot("t1-loopr-faceplate", { around: await p.rect('[aria-label^="Pacer faceplate"]'), pad: 8 });
    await p.app(`d.store.getState().setUiMode("map")`);
    await wait(800);
    const looper = await p.rect(".react-flow__node", "LOOPR");
    const prgm = await p.rect(".react-flow__node", "PRGM1");
    await p.shot("t1-map", { around: [looper, prgm], pad: 40 });
  },

  /** Tutorial 2: a second way in, routed on the map — the copy it costs, and the state it makes. */
  async "tutorial-2"(p) {
    await p.loadLooperTutorial(1);
    await p.app(`
      const s = d.store.getState();
      s.applyEdit((c) => d.editing.clearPreset(c, 24));
      s.setUiMode("map");
    `);
    await wait(800);
    await p.drag(await p.handle("PRGM2", "s-r"), await p.handle("LOOPR", "t-l"));
    await p.click('[role="dialog"] button[aria-haspopup]'); // the first is On switch
    await p.click('[role="option"]', "A — selects the Track preset");
    await p.click('[role="dialog"] label', "Replace what A does");
    await p.click('[role="radio"]', "Comes back here");
    await p.shot("t2-route", { around: await p.rect('[role="dialog"]'), pad: 8 });
    await p.click('[role="dialog"] button', "Add route");
    await wait(800);
    await p.shot("t2-map", {
      around: await p
        .rects(".react-flow__node, .react-flow__edgelabel-renderer div")
        .then((boxes) => boxes.filter((b) => b.y < 400)),
      pad: 30,
    });
    await p.click(".react-flow__node", "LOOPR");
    await p.shot("t2-details", { around: await p.rect('section[aria-label^="LOOPR"]'), pad: 8 });
  },

  /** Tutorial 3: editing the looper once, and both copies following. */
  async "tutorial-3"(p) {
    await p.loadLooperTutorial(2);
    await p.app(`
      const s = d.store.getState();
      s.jumpToPreset(24);
      s.setUiMode("program");
    `);
    const bar = await p.rects("header + div > *, header + div > * > *");
    await p.shot("t3-scope", { around: bar });
    const display = await p.rects('[data-testid="display-line1"], [data-testid="display-line2"]');
    await p.shot("t3-display", { around: display, pad: 30 });
    await p.click('[aria-label$="choose another"]');
    await p.click('[role="radio"]', "By state");
    await p.shot("t3-chooser", { around: await p.rect('[role="dialog"]'), pad: 8 });
    await p.key("Escape");
  },

  /** Each mode's context bar: the row under the header that changes with the mode. */
  async "context-bars"(p) {
    await p.stageMidi();
    const bar = async () => p.rects("header + div > *, header + div > * > *");
    await p.shot("context-simulate", { around: await bar() });
    // With an edit made, so undo, the unsaved mark and Save are all live.
    await p.app(`
      const s = d.store.getState();
      s.setUiMode("program");
      s.applyEdit((c) => d.editing.renamePreset(c, 1, "HOME"));
    `);
    await p.shot("context-program", { around: await bar() });
    await p.app(`d.store.getState().setUiMode("map")`);
    await p.shot("context-map", { around: await bar() });
  },
};

// ---------------------------------------------------------------------------------------------

async function main() {
  const only = process.argv[2];
  const chosen = Object.entries(scenes).filter(([name]) => !only || name.includes(only));
  if (chosen.length === 0) throw new Error(`No scene matches "${only}"`);
  await mkdir(OUT, { recursive: true });

  const vite = await startVite();
  const { chrome, profile } = await startChrome();
  const cdp = await connect();
  try {
    const page = new Page(cdp);
    await page.open();
    for (const [name, scene] of chosen) {
      console.log(name);
      await page.reset();
      await scene(page);
    }
  } finally {
    cdp.close();
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    vite.kill();
    await exited;
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
