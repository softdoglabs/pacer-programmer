#!/usr/bin/env node
/*
 * Follows the tutorials in docs/tutorials click by click, in the real app, and checks that each
 * step does what the page says it does.
 *
 *   pnpm docs:walkthrough
 *
 * The screenshot scenes build each tutorial's configuration directly through the editing
 * functions, which shows what the result looks like but not that the instructions get you there.
 * This does the instructions: it finds controls by the labels the text names, presses them with
 * real mouse and keyboard input, and asserts what the text says you'll see. At the end of each
 * tutorial it compares the configuration it ended up with against the one the screenshots were
 * built from, so the two can't drift apart unnoticed.
 */

import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wait, withApp } from "./docs-browser.mjs";

// ---------------------------------------------------------------------------------------------
// Finding things the way a reader would: by the words on screen.

/** In-page helpers, installed once. Each returns an element or throws naming what it looked for. */
const HELPERS = `
  window.__find = {
    visible: (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; },
    all: (sel, root = document) => [...root.querySelectorAll(sel)].filter(window.__find.visible),
    text: (e) => e.textContent.replace(/\\s+/g, " ").trim(),
    // The innermost visible element matching sel whose text is exactly (or starts with) t.
    byText: (sel, t, { prefix = false, root = document } = {}) => {
      const hits = window.__find.all(sel, root).filter((e) => {
        const x = window.__find.text(e);
        return prefix ? x.startsWith(t) : x === t;
      });
      const area = (e) => { const b = e.getBoundingClientRect(); return b.width * b.height; };
      return hits.sort((a, b) => area(a) - area(b))[0];
    },
    label: (sel, t, root = document) =>
      window.__find.all(sel, root).find((e) => (e.getAttribute("aria-label") ?? "") === t) ??
      window.__find.all(sel, root).find((e) => (e.getAttribute("aria-label") ?? "").startsWith(t)),
    // A field by its visible <label>: the control that label belongs to.
    field: (labelText, root = document) => {
      // Labels can be visually hidden (sr-only) and still name their control, so they aren't
      // filtered by visibility; the control they belong to is.
      // React Aria renders a select's label as a <span>, so either counts, as long as its parent
      // holds a control.
      const labels = [...root.querySelectorAll("label, span")].filter((l) => window.__find.text(l) === labelText);
      return labels
        .map((l) => l.parentElement)
        .find((p) => window.__find.visible(p) && p.querySelector("button, input"));
    },
  };
`;

class Reader {
  constructor(page) {
    this.p = page;
    this.step = "";
  }

  async install() {
    await this.p.eval(HELPERS);
  }

  /** Where in the tutorial we are, for error messages. */
  at(step) {
    this.step = step;
    console.log(`  ${step}`);
  }

  fail(message) {
    throw new Error(`${this.step}: ${message}`);
  }

  /** What's on screen, saved where a failure says, to see what went wrong. */
  async snapshot() {
    const file = join(process.env.WALKTHROUGH_OUT ?? tmpdir(), "walkthrough-failure.png");
    const { data } = await this.p.cdp.send("Page.captureScreenshot", { format: "png" });
    await writeFile(file, Buffer.from(data, "base64"));
    return file;
  }

  /** Clicks the element `expr` (a page expression) finds, with a real mouse. */
  async click(expr, what) {
    const box = await this.p.eval(`(() => {
      const e = ${expr};
      if (!e) return null;
      e.scrollIntoView({ block: "nearest", behavior: "instant" });
      const b = e.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    })()`);
    if (!box) this.fail(`couldn't find ${what}`);
    await this.p.pointClick(box.x, box.y);
    await wait(150);
  }

  button(text, root = "document") {
    return this.click(
      `window.__find.byText("button, [role=button]", ${JSON.stringify(text)}, { root: ${root} })`,
      `the "${text}" button`,
    );
  }

  labelled(label) {
    return this.click(
      `window.__find.label("button, [role=button], [role=radio]", ${JSON.stringify(label)})`,
      `"${label}"`,
    );
  }

  /** Picks `option` in the select labelled `label`. */
  async choose(label, option, root = "document") {
    await this.click(
      `window.__find.field(${JSON.stringify(label)}, ${root})?.querySelector("button")`,
      `the "${label}" picker`,
    );
    await this.click(`window.__find.byText("[role=option]", ${JSON.stringify(option)})`, `"${option}" in "${label}"`);
  }

  /** Picks `option` in the toggle group labelled `label`. */
  toggle(label, option) {
    return this.click(
      `window.__find.byText("button", ${JSON.stringify(option)}, { root: window.__find.label("[role=radiogroup], [role=group], div", ${JSON.stringify(label)}) })`,
      `"${option}" in "${label}"`,
    );
  }

  /** Types `value` into the number field labelled `label`, replacing what's there. */
  async number(label, value, root = "document") {
    await this.click(
      `window.__find.field(${JSON.stringify(label)}, ${root})?.querySelector("input")`,
      `the "${label}" field`,
    );
    await this.p.eval(`document.activeElement.select()`);
    await this.p.cdp.send("Input.insertText", { text: String(value) });
    await this.key("Enter");
  }

  async type(text) {
    await this.p.cdp.send("Input.insertText", { text });
  }

  async key(key) {
    const codes = { Enter: 13, Escape: 27, Tab: 9 };
    for (const type of ["keyDown", "keyUp"]) {
      await this.p.cdp.send("Input.dispatchKeyEvent", {
        type,
        key,
        code: key,
        windowsVirtualKeyCode: codes[key] ?? 0,
        ...(key === "Enter" && type === "keyDown" ? { text: "\r" } : {}),
      });
    }
    await wait(150);
  }

  /** The app's state, read through its own store. */
  state(expr) {
    return this.p.app(`const s = d.store.getState(); return (${expr});`);
  }

  async expect(expr, expected, what) {
    const actual = await this.state(expr);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      this.fail(`expected ${what} to be ${JSON.stringify(expected)}, but it's ${JSON.stringify(actual)}`);
    }
  }

  async expectText(text, what) {
    const found = await this.p.eval(`document.body.innerText.includes(${JSON.stringify(text)})`);
    if (!found) this.fail(`expected to see ${what ?? `"${text}"`} on screen`);
  }

  /** Opens the preset chooser on the display and picks `slot` ("C1"). */
  async preset(slot) {
    await this.click(
      `window.__find.all("button").find((e) => (e.getAttribute("aria-label") ?? "").endsWith("choose another"))`,
      "the preset chooser",
    );
    await this.click(
      `window.__find.all("[role=option]").find((e) => (e.getAttribute("aria-label") ?? "").startsWith(${JSON.stringify(slot + " ")}))`,
      `${slot} in the preset chooser`,
    );
  }

  /** A switch on the faceplate, by its marking ("1", "A"). */
  faceplateSwitch(marking) {
    return this.click(`window.__find.label("button", ${JSON.stringify(`Switch ${marking}:`)})`, `switch ${marking}`);
  }

  /** Picks a colour in the colour picker opened from the button labelled `label`. */
  async colour(label, name) {
    await this.click(`window.__find.label("button", ${JSON.stringify(label + ":")})`, `the "${label}" colour`);
    const dim = name.includes(" Dim ");
    await this.click(
      `window.__find.byText("button", ${JSON.stringify(dim ? "Dim" : "Bright")}, { root: document.querySelector("[role=dialog]") })`,
      dim ? "Dim" : "Bright",
    );
    // A swatch is a radio: its name is on the hidden input inside the label you click.
    await this.click(
      `document.querySelector('[role=dialog] input[aria-label=${JSON.stringify(name)}]')?.closest("label")`,
      `the ${name} swatch`,
    );
    // Choosing closes the picker; only dismiss it if it's still open.
    if (await this.p.eval(`!!document.querySelector("[role=dialog]")`)) await this.key("Escape");
  }
}

// ---------------------------------------------------------------------------------------------
// Comparing against what the screenshots were built from

/** The parts of a preset a reader controls: name, steps, the light of every active step, load MIDI. */
const MEANINGFUL = `(preset) => {
  const controls = {};
  for (const [id, c] of Object.entries(preset.controls)) {
    const steps = {};
    for (const [n, st] of Object.entries(c.steps)) {
      if (!st.active) continue;
      const led = c.led?.[n];
      steps[n] = { type: st.msgType, channel: st.channel, data: st.data, ...(led ? { light: led.position, on: led.activeColor, off: led.inactiveColor } : {}) };
    }
    controls[id] = { mode: c.controlMode, steps };
  }
  return { name: preset.name.trim(), controls, midi: Object.values(preset.midiSettings).filter((m) => m.msgType !== 0x61) };
}`;

async function compareWithScreenshots(r, stage, slots) {
  const mine = await r.p.app(`
    const view = ${MEANINGFUL};
    const c = d.store.getState().board.config;
    return Object.fromEntries(${JSON.stringify(slots)}.map((i) => [i, view(c.presets[i])]));
  `);
  await r.p.loadLooperTutorial(stage);
  const theirs = await r.p.app(`
    const view = ${MEANINGFUL};
    const c = d.store.getState().board.config;
    return Object.fromEntries(${JSON.stringify(slots)}.map((i) => [i, view(c.presets[i])]));
  `);
  const differences = [];
  for (const slot of slots) {
    const a = mine[slot];
    const b = theirs[slot];
    if (a.name !== b.name) differences.push(`${slot}: name ${a.name} vs ${b.name}`);
    for (const id of new Set([...Object.keys(a.controls), ...Object.keys(b.controls)])) {
      const x = JSON.stringify(a.controls[id]);
      const y = JSON.stringify(b.controls[id]);
      if (x !== y)
        differences.push(
          `preset ${slot}, control 0x${Number(id).toString(16)}:\n      walked:      ${x}\n      screenshots: ${y}`,
        );
    }
    if (JSON.stringify(a.midi) !== JSON.stringify(b.midi)) differences.push(`preset ${slot}: load MIDI differs`);
  }
  return differences;
}

// ---------------------------------------------------------------------------------------------
// The tutorials, as written

const LOOPER = [
  ["1", 53, "2A Red", "2B Dim Red"],
  ["2", 54, "7A Green", "7B Dim Green"],
  ["3", 56, "4A Amber", "4B Dim Amber"],
  ["4", 51, "9A Blue", "9B Dim Blue"],
  ["5", 55, "11A Purple", "11B Dim Purple"],
  ["6", 49, "8A Teal", "8B Dim Teal"],
  ["B", 52, "3A Orange", "3B Dim Orange"],
];

async function tutorial1(r) {
  r.at("Start from the factory defaults");
  await r.click(`document.querySelector('[title^="Open configurations"] button')`, "the configuration's name");
  await r.click(`window.__find.byText("button", "Factory defaults", { prefix: true })`, "the Factory defaults row");
  await r.expect(`s.configSource`, "Factory defaults", "the open configuration");

  r.at("Make room in C1");
  await r.toggle("Mode", "Program");
  await r.preset("C1");
  await r.expect(`s.board.activePresetIndex`, 13, "the preset");
  await r.button("Clear preset…");
  await r.button("Clear it");
  await r.expect(`s.board.config.presets[13].name.trim()`, "EMPTY", "C1's name after clearing");
  await r.labelled("Rename preset");
  await r.type("LOOPR");
  await r.key("Enter");
  await r.expect(`s.board.config.presets[13].name.trim()`, "LOOPR", "C1's name");

  r.at("Put the looper on the switches");
  await r.faceplateSwitch("1");
  for (const [marking, cc, on, off] of LOOPER) {
    if (marking !== "1") await r.labelled(`Program ${marking === "B" ? "Stomp B" : `Stomp ${marking}`}`);
    await r.choose("Step 1 type", "CC Trigger");
    await r.number("CC#", cc);
    // "Press 127, Release 0, leave the channel on Global" — check rather than set, since the text
    // implies they're already that way.
    const step = await r.state(`(() => {
      const id = s.selectedControlId;
      const st = s.board.config.presets[13].controls[id].steps[1];
      return { channel: st.channel, data: st.data };
    })()`);
    if (step.data[1] !== 127 || step.data[2] !== 0)
      r.fail(`switch ${marking}: Press/Release are ${step.data[1]}/${step.data[2]}, not 127/0`);
    if (step.channel !== 0) r.fail(`switch ${marking}: the channel is ${step.channel}, not Global`);
    await r.colour(`While CC ${cc} = 127`, on);
    await r.colour("Otherwise", off);
    if (marking === "1") {
      r.at("Press the live switch on the right");
      await r.labelled("Try 1:");
      await r.expectText("CC#53 = 127", "CC 53 = 127 in the log");
      await r.expectText("CC#53 = 0", "CC 53 = 0 in the log");
      r.at("Now do the rest");
    }
  }

  r.at("The way back");
  await r.labelled("Program Stomp A");
  await r.choose("Step 1 type", "Preset Select");
  await r.choose("Jump to", "A1");
  await r.colour("Color", "12A White");

  r.at("The way in");
  await r.click(`window.__find.label("button", "Preset: C1")`, "the breadcrumb's preset chooser");
  await r.click(
    `window.__find.all("[role=option]").find((e) => (e.getAttribute("aria-label") ?? "").startsWith("A1 "))`,
    "A1",
  );
  await r.expect(`s.board.activePresetIndex`, 1, "the preset");
  await r.expect(
    `(() => { const st = s.board.config.presets[1].controls[s.selectedControlId].steps[1]; return [st.msgType, st.data[0]]; })()`,
    [0x62, 1],
    "A1's switch A before changing it (Preset Select to Track)",
  );
  await r.choose("Jump to", "C1");
  await r.colour("Color", "12A White");

  r.at("Try it");
  await r.labelled("Back to faceplate");
  await r.toggle("Mode", "Simulate");
  await r.faceplateSwitch("A");
  await r.expect(`s.board.activePresetIndex`, 13, "the preset after pressing A on A1");
  await r.expect(`s.board.config.presets[s.board.activePresetIndex].name.trim()`, "LOOPR", "the display");
  await r.faceplateSwitch("1");
  await r.expectText("CC#53 = 127");
  await r.faceplateSwitch("A");
  await r.expect(`s.board.activePresetIndex`, 1, "the preset after pressing A on LOOPR");

  r.at("On the map");
  await r.toggle("Mode", "Preset map");
  await wait(600);
  const routes = await r.state(`(() => {
    const m = d.analysis.machineOf(s.board.config);
    const of = (i) => d.analysis.stateContaining(m, i).state;
    const name = (st) => st.name?.trim();
    return [of(1), of(13)].map((st) => st.transitions.filter((t) => !t.viaStepping).map((t) => [name(st), t.controlId, t.to.kind, t.to.kind === "state" ? name(m.states.find((x) => x.id === t.to.id)) : null]));
  })()`);
  const flat = routes.flat();
  if (flat.length !== 2) r.fail(`expected exactly two routes between PRGM1 and LOOPR, got ${JSON.stringify(flat)}`);
  for (const [from, , kind, to] of flat) {
    if (kind !== "state") r.fail(`expected ${from}'s route to be drawn as a jump with one way in, got ${kind}`);
    if (!((from === "PRGM1" && to === "LOOPR") || (from === "LOOPR" && to === "PRGM1")))
      r.fail(`unexpected route ${from} → ${to}`);
  }
}

async function tutorial2(r) {
  r.at("Free up a slot");
  await r.toggle("Mode", "Program");
  await r.preset("D6");
  await r.button("Clear preset…");
  await r.button("Clear it");
  await r.expect(`s.board.config.presets[24].name.trim()`, "EMPTY", "D6's name");

  r.at("Draw the route");
  await r.toggle("Mode", "Preset map");
  await wait(800);
  await r.p.drag(await r.p.handle("PRGM2", "s-r"), await r.p.handle("LOOPR", "t-l"));
  await r.expectText("From PRGM2.");
  await r.choose("On switch", "A — selects the Track preset", `document.querySelector("[role=dialog]")`);
  await r.click(
    `window.__find.byText("[role=dialog] label", "Replace what A does", { prefix: true })`,
    "the Replace tick-box",
  );
  await r.expectText("LOOPR is one preset, entered from A1, and it leads to A1.", "the comes-back question");
  await r.toggle("Leaving it", "Comes back here");
  const slot = await r.p.eval(
    `window.__find.field("Copy of LOOPR goes in")?.querySelector("button")?.textContent.trim()`,
  );
  if (!slot?.startsWith("D6 EMPTY")) r.fail(`expected the copy to default to D6 EMPTY, got ${slot}`);
  await r.button("Add route");
  await wait(600);

  r.at("One state, two presets");
  await r.expectText("2 presets · one state");
  await r.expectText("A returns");
  await r.click(
    `window.__find.all(".react-flow__node").find((n) => n.textContent.includes("LOOPR"))`,
    "the LOOPR state",
  );
  await r.expectText("entered from A1 PRGM1");
  await r.expectText("entered from A2 PRGM2");

  r.at("Try it");
  await r.toggle("Mode", "Simulate");
  await r.preset("A2");
  await r.faceplateSwitch("A");
  await r.expect(`s.board.activePresetIndex`, 24, "the preset after pressing A on A2");
  await r.expect(`s.board.config.presets[24].name.trim()`, "LOOPR", "the display");
  await r.faceplateSwitch("A");
  await r.expect(`s.board.activePresetIndex`, 2, "the preset after pressing A on the copy");
  await r.preset("A1");
  await r.faceplateSwitch("A");
  await r.expect(`s.board.activePresetIndex`, 13, "the preset after pressing A on A1");
  await r.faceplateSwitch("A");
  await r.expect(`s.board.activePresetIndex`, 1, "the preset after pressing A on C1");
}

async function tutorial3(r) {
  r.at("Edit once");
  await r.toggle("Mode", "Program");
  await r.preset("D6");
  await r.expectText("All 2 presets", "Changes: All 2 presets");
  await r.expect(`s.editScope`, "state", "the edit scope");
  const display = await r.p.eval(`document.querySelector('[data-testid="display-line2"]')?.textContent.trim()`);
  if (display?.toLowerCase() !== "x2") r.fail(`expected the display to read x2, got ${display}`);
  await r.expectText("D6 is one of 2 presets that behave alike", "the preset panel's note");
  await r.faceplateSwitch("6");
  await r.colour("While CC 49 = 127", "10A Lavender");
  await r.colour("Otherwise", "10B Dim Lavender");
  await r.click(`window.__find.label("button", "Preset: D6")`, "the breadcrumb's preset chooser");
  await r.click(
    `window.__find.all("[role=option]").find((e) => (e.getAttribute("aria-label") ?? "").startsWith("C1 "))`,
    "C1",
  );
  await r.expect(
    `(() => { const l = s.board.config.presets[13].controls[d.constants.ControlId.Stompswitch6].led[1]; return [l.activeColor, l.inactiveColor]; })()`,
    [19, 20],
    "C1's switch 6 colours",
  );
  await r.labelled("Back to faceplate");

  r.at("See the copies");
  await r.click(
    `window.__find.all("button").find((e) => (e.getAttribute("aria-label") ?? "").endsWith("choose another"))`,
    "the preset chooser",
  );
  await r.toggle("Arrange", "By state");
  await r.expectText("LOOPR — 2 presets, one state");
  await r.key("Escape");

  r.at("Editing one copy on purpose");
  await r.preset("D6");
  await r.toggle("Changes", "D6 only");
  await r.faceplateSwitch("6");
  await r.colour("While CC 49 = 127", "2A Red");
  await r.labelled("Back to faceplate");
  const looperBoxes = await r.state(
    `d.analysis.machineOf(s.board.config).states.filter((st) => st.name?.trim() === "LOOPR").length`,
  );
  if (looperBoxes !== 2) r.fail(`expected two LOOPR states after editing D6 alone, got ${looperBoxes}`);
  await r.labelled("Undo");
  const back = await r.state(
    `d.analysis.machineOf(s.board.config).states.filter((st) => st.name?.trim() === "LOOPR").length`,
  );
  if (back !== 1) r.fail(`expected undo to make LOOPR one state again, got ${back}`);

  r.at("Tidy up the slots");
  await r.preset("D5");
  await r.button("Clear preset…");
  await r.button("Clear it");
  await r.toggle("Mode", "Preset map");
  await wait(800);
  await r.click(
    `window.__find.all(".react-flow__node").find((n) => n.textContent.includes("LOOPR"))`,
    "the LOOPR state",
  );
  await r.choose("Move C1 to", "D5");
  await r.expect(`s.board.config.presets[23].name.trim()`, "LOOPR", "D5 after the move");
  await r.expect(
    `d.constants.presetSelectTargetToIndex(s.board.config.presets[1].controls[d.constants.ControlId.StompswitchA].steps[1].data[0])`,
    23,
    "where A1's switch A leads after the move",
  );
}

// ---------------------------------------------------------------------------------------------

async function run(page, r, problems) {
  await page.reset();
  await r.install();

  console.log("Tutorial 1");
  await tutorial1(r);
  // Each tutorial picks up where the last left off, so the next starts from what following the
  // steps produced, not from the configuration the screenshots were built from.
  const walked1 = await r.state(`s.board.config`);
  const after1 = await compareWithScreenshots(r, 1, [1, 13]);
  problems.push(...after1.map((d) => `tutorial 1 vs its screenshots: ${d}`));

  console.log("Tutorial 2");
  await page.app(`d.store.getState().loadConfig(${JSON.stringify(walked1)}, "Looper tutorial")`);
  await tutorial2(r);
  const walked2 = await r.state(`s.board.config`);
  const after2 = await compareWithScreenshots(r, 2, [1, 2, 13, 24]);
  problems.push(...after2.map((d) => `tutorial 2 vs its screenshots: ${d}`));

  console.log("Tutorial 3");
  await page.app(`d.store.getState().loadConfig(${JSON.stringify(walked2)}, "Looper tutorial")`);
  await tutorial3(r);
}

async function main() {
  const problems = [];
  await withApp(async (page) => {
    const r = new Reader(page);
    try {
      await run(page, r, problems);
    } catch (error) {
      error.message += `\n  (screen saved to ${await r.snapshot()})`;
      throw error;
    }
  });
  if (problems.length > 0) {
    console.log(`\n${problems.length} difference(s) between following the steps and the screenshots:`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log("\nEvery step did what the tutorials say.");
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
