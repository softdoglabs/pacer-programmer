import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ControlId, SwitchMessageType, userPresetIndex } from "../../protocol/constants";
import { decodeSysex } from "../../protocol/decode";
import { changedPresets, mismatchedPresets } from "../diff";
import { renamePreset, setStepType } from "../edits";

const factory = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
const A1 = userPresetIndex(0, 1);
const C1 = userPresetIndex(2, 1);

describe("preset diffs", () => {
  it("lists exactly the user presets that changed, ignoring the Current slot", () => {
    expect(changedPresets(factory, factory)).toEqual([]);
    let edited = renamePreset(factory, C1, "LOOPR");
    edited = setStepType(edited, A1, ControlId.StompswitchA, 1, "switch", SwitchMessageType.CcToggle);
    edited = renamePreset(edited, 0, "CURR"); // Current slot: never a send target
    expect(changedPresets(factory, edited)).toEqual([A1, C1]);
  });

  it("compares a read-back against what was sent", () => {
    const edited = renamePreset(factory, C1, "LOOPR");
    expect(mismatchedPresets(edited, edited, [A1, C1])).toEqual([]);
    expect(mismatchedPresets(edited, factory, [A1, C1])).toEqual([C1]);
  });
});

describe("preset equality", () => {
  it("ignores key order and undefined-valued keys", () => {
    const a = structuredClone(factory);
    const step = a.presets[A1]!.controls[ControlId.StompswitchA]!.steps[1]!;
    a.presets[A1]!.controls[ControlId.StompswitchA]!.steps[1] = Object.fromEntries(
      Object.entries(step).reverse(),
    ) as typeof step;
    expect(changedPresets(factory, a)).toEqual([]);
  });
});
