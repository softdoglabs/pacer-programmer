// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { beforeEach, describe, expect, it } from "vitest";
import { recoverMachine } from "../../pacer/analysis";
import { compileMachine } from "../../test/compileMachine";
import { clearPreset, renamePreset, setStepType } from "../../pacer/editing";
import { loadFactoryDefaults } from "../../pacer/factoryDefaults";
import { ControlId, SwitchMessageType, userPresetIndex } from "../../pacer/protocol/constants";
import { decodeSysex } from "../../pacer/protocol/decode";
import { hasUnsavedEdits } from "../editingSlice";
import { usePacerStore } from "../pacerStore";

const store = () => usePacerStore.getState();
const A1 = userPresetIndex(0, 1);
const rename = (name: string) => store().applyEdit((c) => renamePreset(c, A1, name));
const nameOf = () => store().board.config.presets[A1]?.name;

beforeEach(() => {
  for (const e of store().library.entries) store().deleteSavedConfig(e.id);
  store().openFactoryDefaults();
  store().setUiMode("simulate");
});

describe("editing", () => {
  it("edits the live config the simulator runs, and tracks unsaved changes", () => {
    expect(hasUnsavedEdits(store())).toBe(false);
    rename("LOOP");
    expect(nameOf()).toBe("LOOP ");
    expect(hasUnsavedEdits(store())).toBe(true);
    store().applyEdit((c) => c); // a no-op edit records nothing
    expect(store().editHistory.past).toHaveLength(1);
  });

  it("undoes and redoes, and undoing back to the baseline is 'no unsaved changes'", () => {
    rename("ONE");
    rename("TWO");
    store().undo();
    expect(nameOf()).toBe("ONE  ");
    store().undo();
    expect(nameOf()).toBe("PRGM1");
    expect(hasUnsavedEdits(store())).toBe(false);
    store().undo(); // nothing left: no-op
    store().redo();
    store().redo();
    expect(nameOf()).toBe("TWO  ");
    store().redo(); // nothing left: no-op
    rename("NEW"); // a fresh edit clears the redo stack
    store().undo();
    store().redo();
    expect(nameOf()).toBe("NEW  ");
    expect(store().editHistory.future).toEqual([]);
  });

  it("saves as a new snapshot (edited from the open config) and switches to it", () => {
    rename("LOOP");
    store().applyEdit((c) => setStepType(c, A1, ControlId.StompswitchA, 1, "switch", SwitchMessageType.CcToggle));
    store().saveAsNewSnapshot("My rig");
    const [entry] = store().library.entries;
    expect(entry).toMatchObject({ name: "My rig", source: { kind: "edit", basedOn: "Factory defaults" } });
    expect(store().activeConfigId).toBe(entry!.id);
    expect(store().configSource).toBe("My rig");
    expect(hasUnsavedEdits(store())).toBe(false);
    // The saved bytes are exactly the edited config.
    expect(decodeSysex(store().savedConfigBytes(entry!.id))).toEqual(store().board.config);
  });

  it("saves over the open snapshot, but never over the factory defaults", () => {
    store().saveOverActive();
    expect(store().library.error).toMatch(/read-only/);

    store().saveAsNewSnapshot("Rig");
    const id = store().activeConfigId!;
    rename("V2");
    store().saveOverActive();
    expect(store().library.entries).toHaveLength(1);
    expect(store().library.entries[0]!.modifiedAt).toBeDefined();
    expect(hasUnsavedEdits(store())).toBe(false);
    expect(decodeSysex(store().savedConfigBytes(id)).presets[A1]!.name).toBe("V2   ");
  });

  it("opening another configuration starts over: fresh baseline, empty history", () => {
    rename("LOOP");
    store().loadConfig(loadFactoryDefaults(), "Factory defaults");
    expect(store().editHistory).toEqual({ past: [], future: [] });
    expect(hasUnsavedEdits(store())).toBe(false);
    expect(nameOf()).toBe("PRGM1");
  });

  it("keeps the simulator's runtime and MIDI state across edits (live preview)", () => {
    store().press(ControlId.Stompswitch2);
    store().release(ControlId.Stompswitch2); // PC 1
    rename("LIVE");
    expect(store().board.midi.programs[0]).toMatchObject({ program: 1 });
  });

  it("changes every preset a state is, as one undoable step", () => {
    /*
     * The map draws presets that behave alike as one state, so the editor changes them together —
     * keeping copies in step by hand is the work this project exists to remove. Narrowing the
     * scope to one preset is the deliberate way to make it differ.
     */
    const compiled = compileMachine({
      states: [
        ...[0, 1].map((i) => ({
          id: `m${i}`,
          name: `MAIN${i}`,
          body: {
            [ControlId.Stompswitch1]: {
              steps: {
                1: {
                  channel: 0,
                  msgType: SwitchMessageType.Note,
                  data: [60 + i, 127, 0] as [number, number, number],
                  active: true,
                },
              },
              led: {},
            },
          },
          transitions: [
            { controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "state" as const, id: "loop" } },
          ],
        })),
        {
          id: "loop",
          name: "LOOPR",
          body: {
            [ControlId.Stompswitch1]: {
              steps: {
                1: {
                  channel: 0,
                  msgType: SwitchMessageType.Note,
                  data: [99, 127, 0] as [number, number, number],
                  active: true,
                },
              },
              led: {},
            },
          },
          transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "return" as const } }],
        },
      ],
    });
    if (!compiled.ok) throw new Error(compiled.error);
    store().loadConfig(compiled.config, "Looper");

    const machine = recoverMachine(store().board.config);
    const copies = machine.members[machine.states.find((s) => s.name === "LOOPR")!.id]!;
    expect(copies).toHaveLength(2);
    store().jumpToPreset(copies[0]!);

    const typeOf = (preset: number) =>
      store().board.config.presets[preset]?.controls[ControlId.Stompswitch1]?.steps[1]?.msgType;
    store().applyPresetEdit((c, i) =>
      setStepType(c, i, ControlId.Stompswitch1, 1, "switch", SwitchMessageType.CcToggle),
    );
    for (const copy of copies) expect(typeOf(copy)).toBe(SwitchMessageType.CcToggle);
    expect(store().editHistory.past).toHaveLength(1); // one change to one thing

    store().undo();
    for (const copy of copies) expect(typeOf(copy)).toBe(SwitchMessageType.Note);

    store().setEditScope("preset");
    store().applyPresetEdit((c, i) =>
      setStepType(c, i, ControlId.Stompswitch1, 1, "switch", SwitchMessageType.CcToggle),
    );
    expect(typeOf(copies[0]!)).toBe(SwitchMessageType.CcToggle);
    expect(typeOf(copies[1]!)).toBe(SwitchMessageType.Note); // left behind, on purpose
  });

  it("follows the preset you're on when its slot moves, and says when a move is refused", () => {
    const D6 = userPresetIndex(3, 6);
    store().applyEdit((c) => clearPreset(c, D6)); // somewhere empty to move to
    store().jumpToPreset(A1);
    const name = nameOf();

    expect(store().movePresetToSlot(A1, D6)).toBeUndefined();
    // Same preset, new number: the simulator didn't stay on the slot that was just emptied.
    expect(store().board.activePresetIndex).toBe(D6);
    expect(store().board.config.presets[D6]?.name).toBe(name);

    // Onto a preset with something in it: refused, nothing changed, and the reason comes back.
    const before = store().board.config;
    const refused = store().movePresetToSlot(D6, userPresetIndex(0, 2));
    expect(refused).toMatch(/Clear it first/);
    expect(store().board.config).toBe(before);
  });

  it("moves onto a preset in use when told to clear it first, as one undo step", () => {
    // The factory set fills all 24, so without this a preset on a new device can't be moved at all.
    const D6 = userPresetIndex(3, 6);
    const name = store().board.config.presets[A1]?.name;
    const was = store().board.config.presets[D6]?.name;
    const steps = store().editHistory.past.length;

    expect(store().movePresetToSlot(A1, D6, { clearFirst: true })).toBeUndefined();
    expect(store().board.config.presets[D6]?.name).toBe(name);
    expect(store().editHistory.past.length).toBe(steps + 1);

    store().undo();
    expect(store().board.config.presets[D6]?.name).toBe(was);
    expect(store().board.config.presets[A1]?.name).toBe(name);
  });
});
