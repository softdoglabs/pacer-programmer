import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renamePreset } from "../../editing";
import { userPresetIndex } from "../../protocol/constants";
import { decodeSysex } from "../../protocol/decode";
import { machineOf, stateContaining } from "../machineOf";

const factory = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));

describe("one machine per configuration", () => {
  it("hands every caller the same object for the same configuration", () => {
    // What makes it one representation rather than several that happen to agree.
    expect(machineOf(factory)).toBe(machineOf(factory));
  });

  it("is a new machine the moment the configuration is a new version", () => {
    const edited = renamePreset(factory, userPresetIndex(0, 1), "HOME");
    expect(machineOf(edited)).not.toBe(machineOf(factory));
    expect(stateContaining(machineOf(edited), userPresetIndex(0, 1))?.state.name?.trim()).toBe("HOME");
    // The old version is untouched: undo hands it straight back.
    expect(stateContaining(machineOf(factory), userPresetIndex(0, 1))?.state.name?.trim()).toBe("PRGM1");
  });
});
