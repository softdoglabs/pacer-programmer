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
   * text includes it (every ancestor contains the text too, up to the whole app).
   */
  async rect(selector, text) {
    const r = await this.eval(`(() => {
      const all = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .filter((e) => ${text === undefined ? "true" : `e.textContent.includes(${JSON.stringify(text)})`})
        .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
      const area = (e) => { const b = e.getBoundingClientRect(); return b.width * b.height; };
      const el = ${text === undefined ? "all[0]" : "all.sort((a, b) => area(a) - area(b))[0]"};
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    })()`);
    if (!r) throw new Error(`Nothing on the page matches ${selector}${text ? ` with "${text}"` : ""}`);
    return r;
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
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
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
