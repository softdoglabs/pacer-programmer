#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

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
 * The browser side lives in docs-browser.mjs.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { OUT, ROOT, union, wait, withApp } from "./docs-browser.mjs";

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
    // Unnumbered, for the guide, which explains the lights in prose rather than with a key.
    await p.shot("switch-anatomy-plain", { around: below, pad: 28 });
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
    // Unnumbered, for the guide; the key lives in the reference.
    await p.shot("switch-editor-plain", { around: await p.rect('[aria-label="Programming Stomp 1"]'), pad: 16 });

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
   * Two mains share a looper whose A goes to MAIN0. Pointing A at MAIN1 is a conflict, so the
   * dialog asks; going back to wherever it was entered from costs a preset.
   */
  async "route-choice"(p) {
    await p.app(`
      const C = d.constants.ControlId;
      const T = d.constants.SwitchMessageType;
      const note = (n) => ({ [C.Stompswitch1]: { steps: { 1: { channel: 0, msgType: T.Note, data: [n, 127, 0], active: true } }, led: {} } });
      const compiled = d.compile.compileMachine({ states: [
        { id: "m0", name: "MAIN0", body: note(60), transitions: [{ controlId: C.StompswitchA, stepNumber: 1, to: { kind: "state", id: "loop" } }] },
        { id: "m1", name: "MAIN1", body: note(61), transitions: [{ controlId: C.StompswitchA, stepNumber: 1, to: { kind: "state", id: "loop" } }] },
        { id: "loop", name: "LOOPR", body: note(99), transitions: [{ controlId: C.StompswitchA, stepNumber: 1, to: { kind: "state", id: "m0" } }] },
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
    await p.drag(await p.handle("LOOPR", "s-l"), await p.handle("MAIN1", "t-r"));
    await p.click('[role="dialog"] button[aria-haspopup]');
    await p.click('[role="option"]', "A — goes to MAIN0");
    await p.click('[role="dialog"] label', "Goes back to wherever LOOPR");
    await p.shot("route-choice", { around: await p.rect('[role="dialog"]'), pad: 8 });
    await p.key("Escape");
  },

  /**
   * Import presets… given the AI example's dump while the factory defaults are open: a whole file,
   * of which the two presets that differ are ticked. Then brought in, which has to change exactly
   * those two.
   */
  async "import-presets"(p) {
    await p.app(`d.store.getState().setDeviceDrawerOpen(true);`);
    await wait(600);
    const { root } = await p.cdp.send("DOM.getDocument");
    const { nodeId } = await p.cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: '[aria-label="File to import presets from"]',
    });
    await p.cdp.send("DOM.setFileInputFiles", { nodeId, files: [join(ROOT, "fixtures", "ai-looper.syx")] });
    await wait(600);
    const heading = await p.rect('[role="dialog"] h2, [role="dialog"] [slot="title"]', "Bring presets in from");
    const button = await p.rect('[role="dialog"] button', "Bring in 2 presets");
    const list = await p.rect('ul[aria-label="Presets in the file"]');
    await p.shot("import-presets", {
      around: { x: list.x, y: heading.y, width: list.width, height: button.y + button.height - heading.y },
      pad: 24,
    });
    await p.click('[role="dialog"] button', "Bring in 2 presets");
    await wait(400);
    const changed = await p.app(`
      const s = d.store.getState();
      return d.editing.changedPresets(d.factory.loadFactoryDefaults(), s.board.config);
    `);
    if (JSON.stringify(changed) !== "[1,13]")
      throw new Error(`import-presets: expected A1 and C1 to change, got ${changed}`);
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
        { n: 3, box: await p.rect("button", "Import presets…"), at: "corner" },
        {
          n: 4,
          box: union(await p.rects('[role="dialog"] [aria-label^="Pacer"], [role="dialog"] button[aria-haspopup]')),
          at: "right",
        },
        { n: 5, box: await p.rect("span", "Firmware"), at: "right" },
        { n: 6, box: await p.rect("li", "Factory defaults"), at: "corner" },
        { n: 7, box: await p.rect("li", "looper-from-claude"), at: "corner" },
        {
          n: 8,
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

  /** The front page's picture: the looper being played, its MIDI going out to a Quad Cortex. */
  async simulator(p) {
    await p.resize(1230);
    await p.stageMidi();
    await p.loadLooperTutorial(1);
    await p.app(`
      const s = d.store.getState();
      const C = d.constants.ControlId;
      const tap = (id) => { s.press(id); s.release(id); };
      tap(C.StompswitchA); // A1 -> LOOPR
      tap(C.Stompswitch1);
      s.press(C.Stompswitch3); // held, so it shows bright
    `);
    await p.shot("simulator");
    await p.app(`d.store.getState().release(d.constants.ControlId.Stompswitch3)`);
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

  /** Tutorial 2: a second way in, free; then A going back, which costs a copy; and the state it makes. */
  async "tutorial-2"(p) {
    await p.loadLooperTutorial(1);
    await p.app(`d.store.getState().setUiMode("map");`);
    await wait(800);
    await p.drag(await p.handle("PRGM2", "s-r"), await p.handle("LOOPR", "t-l"));
    await p.click('[role="dialog"] button[aria-haspopup]'); // the first is On switch
    await p.click('[role="option"]', "A — selects the Track preset");
    await p.click('[role="dialog"] label', "Replace what A does");
    await p.shot("t2-route", { around: await p.rect('[role="dialog"]'), pad: 8 });
    await p.click('[role="dialog"] button', "Add route");
    await wait(800);
    // The way back: A already goes to PRGM1, so the dialog asks, and going back costs a preset.
    // None is empty, as on every Pacer until one's cleared, so it's D6 and a tick to agree.
    await p.drag(await p.handle("LOOPR", "s-l"), await p.handle("PRGM2", "t-r"));
    await p.click('[role="dialog"] button[aria-haspopup]');
    await p.click('[role="option"]', "A — goes to PRGM1");
    await p.click('[role="dialog"] label', "Goes back to wherever LOOPR");
    await p.click('[role="dialog"] button', "Choose a preset");
    await p.click('[role="option"]', "D6 SEQNC");
    await p.shot("route-clear", { around: await p.rect('[role="dialog"]'), pad: 8 }); // the reference's, unticked
    await p.click('[role="dialog"] label', "Clear D6 SEQNC to make room");
    await p.shot("t2-return", { around: await p.rect('[role="dialog"]'), pad: 8 });
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
  await withApp(async (page) => {
    for (const [name, scene] of chosen) {
      console.log(name);
      await page.reset();
      await scene(page);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
