import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSysex } from "../decode";
import {
  DEFAULT_GLOBAL_CHANNEL,
  activeUserPresetIndex,
  currentGlobalConfig,
  globalMidiChannel,
  readGlobalElement,
  wireChannel,
} from "../globalSettings";
import { createEmptyPacerConfig } from "../types";

const factory = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));

describe("global settings", () => {
  it("reads the factory global config: Global Preset 1 active, global channel 1, dim level 4", () => {
    expect(currentGlobalConfig(factory)).toBe(1);
    expect(globalMidiChannel(factory)).toBe(1);
    expect(readGlobalElement(factory, 1, 0x01, 0x62)).toEqual([4]); // Dim Level
    expect(readGlobalElement(factory, 1, 0x01, 0x7e)).toBeUndefined();
  });

  it("follows the current global config and edits to its channel", () => {
    const config = structuredClone(factory);
    const preset2 = config.globalFields.find((f) => f.idx === 2 && f.obj === 1 && f.elm === 1)!;
    preset2.data[1] = 10; // Global Preset 2's channel -> 10
    expect(globalMidiChannel(config)).toBe(1); // still on Global Preset 1
    const current = config.globalFields.find((f) => f.idx === 0 && [f.elm, ...f.data].includes(0x31))!;
    const bytes = [current.elm, ...current.data];
    bytes[bytes.indexOf(0x31) + 2] = 2; // switch to Global Preset 2
    current.data = bytes.slice(1);
    expect(currentGlobalConfig(config)).toBe(2);
    expect(globalMidiChannel(config)).toBe(10);
  });

  it("defaults when the config has no globals", () => {
    expect(globalMidiChannel(createEmptyPacerConfig())).toBe(DEFAULT_GLOBAL_CHANNEL);
  });
});

describe("wireChannel", () => {
  it("maps 0 to the global channel and 1-16 to wire nibbles 0-15", () => {
    expect(wireChannel(0, 1)).toBe(0);
    expect(wireChannel(0, 10)).toBe(9);
    expect(wireChannel(1, 10)).toBe(0);
    expect(wireChannel(16, 1)).toBe(15);
    expect(wireChannel(17, 1)).toBeUndefined();
  });
});

/** A copy of `config` with one element of the global "Current" block (idx 0, obj 1) set to `value`. */
function withCurrentElement(config: typeof factory, elm: number, value: number) {
  const copy = structuredClone(config);
  const field = copy.globalFields.find((f) => f.idx === 0 && f.obj === 1 && [f.elm, ...f.data].includes(elm))!;
  const bytes = [field.elm, ...field.data];
  bytes[bytes.indexOf(elm) + 2] = value;
  field.elm = bytes[0]!;
  field.data = bytes.slice(1);
  return copy;
}

describe("activeUserPresetIndex", () => {
  it("reads the loaded user preset as a SysEx idx (0 = A1 in the global field)", () => {
    expect(activeUserPresetIndex(factory)).toBe(1); // A1
    expect(activeUserPresetIndex(withCurrentElement(factory, 0x1e, 23))).toBe(24); // D6
  });

  it("is undefined on a Track/Transport preset or when the fields are missing", () => {
    expect(activeUserPresetIndex(withCurrentElement(factory, 0x1a, 1))).toBeUndefined();
    expect(activeUserPresetIndex(createEmptyPacerConfig())).toBeUndefined();
  });
});
