import { beforeEach, describe, expect, it } from "vitest";
import { renamePreset, setStepType } from "../../pacer/editing";
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
  store().setUiMode("play");
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
});
