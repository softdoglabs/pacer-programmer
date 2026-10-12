// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { userPresetIndex } from "../constants";
import { decodeSysex } from "../decode";
import { encodePresetAsCurrentMessages, encodePresetMessages } from "../encode";

const factory = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
const A1 = userPresetIndex(0, 1);
const C1 = userPresetIndex(2, 1);

describe("encodePresetMessages", () => {
  it("encodes only the chosen presets, with no global settings, decoding back to them", () => {
    const edited = structuredClone(factory);
    edited.presets[C1]!.name = "LOOPR";
    const messages = encodePresetMessages(edited, [A1, C1]);
    const decoded = decodeSysex(Uint8Array.from(messages.flatMap((m) => [...m])));
    expect(Object.keys(decoded.presets).map(Number)).toEqual([A1, C1]);
    expect(decoded.globalFields).toEqual([]);
    expect(decoded.presets[C1]).toEqual(edited.presets[C1]);
    // Every message is a Set (cmd 0x01) to target Preset (0x01) at idx A1 or C1.
    for (const m of messages) {
      expect([m[0], m[m.length - 1]]).toEqual([0xf0, 0xf7]);
      expect([m[5], m[6]]).toEqual([0x01, 0x01]);
      expect([A1, C1]).toContain(m[7]);
    }
  });
});

describe("encodePresetAsCurrentMessages", () => {
  it("addresses a preset's contents to the Current slot (idx 0)", () => {
    const messages = encodePresetAsCurrentMessages(factory, C1);
    expect(messages.every((m) => m[7] === 0)).toBe(true);
    const decoded = decodeSysex(Uint8Array.from(messages.flatMap((m) => [...m])));
    expect(decoded.presets[0]).toEqual({ ...factory.presets[C1], index: 0 });
  });
});
