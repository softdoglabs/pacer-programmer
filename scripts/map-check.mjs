#!/usr/bin/env node
/*
 * Checks the preset map's drawing, in the real app, across the shapes that have broken it before.
 *
 *   pnpm check:map
 *
 * For each configuration, in both views (Designed routes and Everything), it measures every edge
 * the map draws and fails on:
 * - arrowheads closer than a head's width (two routes reading as one),
 * - a head landing on another edge's tail,
 * - two edges whose paths run together,
 * - states outside the visible map, including after an edit re-lays it out.
 *
 * Screenshots of anything that fails are saved to the system's temp folder. Configurations are
 * built through the app's own modules; add one here whenever the map draws something wrong.
 */

import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wait, withApp } from "./docs-browser.mjs";

const out = tmpdir();

// Configurations, each built in the page; `then` optionally edits after the map is showing.
const LOOPER = (mains, ret) => `
  const C = d.constants.ControlId, T = d.constants.SwitchMessageType;
  const note = (n) => ({ [C.Stompswitch1]: { steps: { 1: { channel: 0, msgType: T.Note, data: [n, 127, 0], active: true } }, led: {} } });
  const ms = Array.from({ length: ${mains} }, (_, i) => ({ id: "m" + i, name: "MAIN" + i, body: note(60 + i), transitions: [{ controlId: C.StompswitchA, stepNumber: 1, to: { kind: "state", id: "loop" } }] }));
  const r = d.compile.compileMachine({ states: [...ms, { id: "loop", name: "LOOPR", body: note(99), transitions: [{ controlId: C.StompswitchA, stepNumber: 1, to: ${ret} }] }] });
  if (!r.ok) throw new Error(r.error);
  const f = d.factory.loadFactoryDefaults();
  d.store.getState().loadConfig({ ...f, presets: { ...f.presets, ...r.config.presets } }, "x");
`;
const scenarios = {
  // Built by the tutorials' own builder (see loadLooperTutorial).
  "t1 pair": "tutorial 1",
  "t2 two in, returns": "tutorial 2",
  "four in, returns": LOOPER(4, `{ kind: "return" }`),
  // Two mains share one LOOPR that always goes to MAIN0: the "Always goes to A1" answer.
  "two in, fixed back to one": LOOPER(2, `{ kind: "state", id: "m0" }`),
  "three in, fixed back to one": LOOPER(3, `{ kind: "state", id: "m0" }`),
  factory: `d.store.getState().loadConfig(d.factory.loadFactoryDefaults(), "f")`,
};

const MEASURE = `(() => {
  const vp = document.querySelector(".react-flow").getBoundingClientRect();
  const paths = [...document.querySelectorAll(".react-flow__edge")].map((g) => {
    const p = g.querySelector("path.react-flow__edge-path");
    const len = p.getTotalLength();
    const pts = Array.from({ length: 41 }, (_, i) => p.getPointAtLength((len * i) / 40));
    return { id: g.getAttribute("data-id") || g.id, pts };
  });
  // Screen-space node boxes, to see whether any fall outside the map's viewport.
  const nodes = [...document.querySelectorAll(".react-flow__node")].map((n) => { const b = n.getBoundingClientRect(); return { t: n.textContent.slice(0, 5), x: b.x, y: b.y, r: b.right, b: b.bottom }; });
  const t = document.querySelector(".react-flow__viewport").style.transform;
  return { paths, nodes, vp: { x: vp.x, y: vp.y, r: vp.right, b: vp.bottom }, t };
})()`;

function analyse(m) {
  const problems = [];
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // Heads: an edge's last point. Too close to another head, or to another edge's tail.
  for (let i = 0; i < m.paths.length; i++) {
    for (let j = 0; j < m.paths.length; j++) {
      if (i === j) continue;
      const a = m.paths[i],
        b = m.paths[j];
      const headA = a.pts[a.pts.length - 1];
      if (j > i && d(headA, b.pts[b.pts.length - 1]) < 7) problems.push(`heads stack: ${a.id} & ${b.id}`);
      if (d(headA, b.pts[0]) < 4) problems.push(`head on tail: ${a.id} -> ${b.id}`);
      // Running together: share many sample points.
      if (j > i) {
        const close = a.pts.filter((p) => b.pts.some((q) => d(p, q) < 2.5)).length;
        if (close > 8) problems.push(`run together (${close}/41 pts): ${a.id} & ${b.id}`);
      }
    }
  }
  const outside = m.nodes.filter((n) => n.x < m.vp.x - 1 || n.r > m.vp.r + 1 || n.y < m.vp.y - 1 || n.b > m.vp.b + 1);
  if (outside.length)
    problems.push(`${outside.length} node(s) outside the visible map: ${outside.map((n) => n.t).join(", ")}`);
  return problems;
}

const failures = [];
await withApp(async (p) => {
  for (const [name, setup] of Object.entries(scenarios)) {
    for (const view of ["Designed routes", "Everything"]) {
      await p.reset();
      if (setup === "tutorial 1") await p.loadLooperTutorial(1);
      else if (setup === "tutorial 2") await p.loadLooperTutorial(2);
      else await p.app(setup);
      await p.app(`d.store.getState().setUiMode("map")`);
      await wait(900);
      if (view === "Everything") {
        await p.click('[role="radio"]', "Everything");
        await wait(900);
      }
      const m = await p.eval(MEASURE);
      const problems = analyse(m);
      console.log(`${name} / ${view}: ${problems.length ? "\n    " + problems.join("\n    ") : "ok"}`);
      if (problems.length) {
        const file = join(
          out,
          `map-check-${name.replace(/\W+/g, "-")}-${view === "Everything" ? "all" : "designed"}.png`,
        );
        const r = await p.cdp.send("Page.captureScreenshot", { format: "png" });
        await writeFile(file, Buffer.from(r.data, "base64"));
        failures.push(`${name} / ${view} (screen: ${file})`);
      }
    }
  }
  // After an edit: open the map on the factory set, then add a route the way the dialog would.
  // The layout changes, and the view has to follow it.
  await p.reset();
  await p.app(`d.store.getState().setUiMode("map")`);
  await wait(900);
  await p.app(`
    const s = d.store.getState(); const C = d.constants.ControlId;
    s.applyEdit((c) => d.editing.setJump(c, 1, C.StompswitchA, 1, 13));
  `);
  await wait(900);
  const after = await p.eval(MEASURE);
  const lost = analyse(after).filter((x) => x.includes("outside"));
  console.log(`after an edit: ${lost.length ? lost.join("; ") : "ok"}`);
  if (lost.length) failures.push("after an edit");
});

if (failures.length) {
  console.log(`\n${failures.length} failing:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nThe map draws every case cleanly.");
