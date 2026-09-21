import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CURRENT_PRESET_INDEX,
  LAST_USER_PRESET_INDEX,
  PresetSelectTarget,
  presetBank,
  presetIndexToLabel,
  presetIndexToPresetSelectTarget,
  presetNumber,
  presetSelectTargetToIndex,
  userPresetIndex,
  wrapUserPresetIndex,
} from "../constants";
import { decodeSysex } from "../decode";

describe("preset numbering", () => {
  it("SysEx idx 0 is Current; 1-24 are A1-D6", () => {
    expect(presetIndexToLabel(CURRENT_PRESET_INDEX)).toBe("CUR");
    expect(presetIndexToLabel(1)).toBe("A1");
    expect(presetIndexToLabel(6)).toBe("A6");
    expect(presetIndexToLabel(7)).toBe("B1");
    expect(presetIndexToLabel(24)).toBe("D6");
    expect(presetIndexToLabel(25)).toBe("#25");
    expect(LAST_USER_PRESET_INDEX).toBe(24);
  });

  it("bank/number <-> idx round-trip for every user preset", () => {
    for (let bank = 0; bank < 4; bank++) {
      for (let num = 1; num <= 6; num++) {
        const idx = userPresetIndex(bank, num);
        expect(presetBank(idx)).toBe(bank);
        expect(presetNumber(idx)).toBe(num);
      }
    }
    expect(presetBank(CURRENT_PRESET_INDEX)).toBeUndefined();
    expect(() => userPresetIndex(4, 1)).toThrow(RangeError);
    expect(() => userPresetIndex(0, 7)).toThrow(RangeError);
  });

  it("PresetSelect targets: 0-2 are reserved, 3 = A1 .. 26 = D6", () => {
    expect(presetSelectTargetToIndex(0)).toBeUndefined();
    expect(presetSelectTargetToIndex(1)).toBeUndefined();
    expect(presetSelectTargetToIndex(2)).toBeUndefined();
    expect(presetSelectTargetToIndex(3)).toBe(userPresetIndex(0, 1));
    expect(presetSelectTargetToIndex(26)).toBe(userPresetIndex(3, 6));
    expect(presetSelectTargetToIndex(27)).toBeUndefined();
    for (let idx = 1; idx <= 24; idx++) {
      const target = presetIndexToPresetSelectTarget(idx);
      expect(PresetSelectTarget[target]).toBe(presetIndexToLabel(idx));
      expect(presetSelectTargetToIndex(target)).toBe(idx);
    }
  });

  it("wraps D6 -> A1 and A1 -> D6", () => {
    expect(wrapUserPresetIndex(25)).toBe(1);
    expect(wrapUserPresetIndex(0)).toBe(24);
    expect(wrapUserPresetIndex(12)).toBe(12);
  });

  it("matches the factory dump: slot 0 duplicates A1, and A1-A6 match the User Guide's factory list", () => {
    const config = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
    const name = (idx: number) => config.presets[idx]?.name;
    expect(name(CURRENT_PRESET_INDEX)).toBe(name(userPresetIndex(0, 1)));
    // User Guide: A1-A4 program change, A5 MIDI notes, A6 relays.
    expect([1, 2, 3, 4, 5, 6].map((n) => name(userPresetIndex(0, n)))).toEqual(["PRGM1", "PRGM2", "PRGM3", "PRGM4", "NOTES", "RELAY"]);
  });
});
