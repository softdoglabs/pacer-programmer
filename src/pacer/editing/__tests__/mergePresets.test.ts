// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ControlId, SwitchMessageType, userPresetIndex } from "../../protocol/constants";
import { decodeSysex } from "../../protocol/decode";
import { encodePresetMessages, encodeSysex } from "../../protocol/encode";
import type { PacerConfig } from "../../protocol/types";
import { changedPresets } from "../diff";
import { renamePreset, updateStep } from "../edits";
import { mergePresets, presetsMergeWouldChange, readPresetFile } from "../mergePresets";

const factory = (): PacerConfig => decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
const join = (messages: Uint8Array[]) => Uint8Array.from(messages.flatMap((m) => [...m]));
const C1 = userPresetIndex(2, 1);
const D6 = userPresetIndex(3, 6);

/** The factory set with C1 renamed and its switch 1 sending CC 53. */
function edited(): PacerConfig {
  let c = renamePreset(factory(), C1, "LOOPR");
  c = updateStep(c, C1, ControlId.Stompswitch1, 1, { msgType: SwitchMessageType.CcToggle, data: [53, 127, 0] });
  return c;
}

describe("bringing presets in from a file", () => {
  it("reads a file of one preset as that preset, and a dump as all 24", () => {
    const one = readPresetFile(join(encodePresetMessages(edited(), [C1])));
    expect(one.presets).toEqual([C1]);
    expect(one.whole).toBe(false);
    expect(one.hasGlobals).toBe(false);

    const dump = readPresetFile(encodeSysex(edited()));
    expect(dump.presets).toHaveLength(24);
    expect(dump.whole).toBe(true);
    expect(dump.hasGlobals).toBe(true);
  });

  it("writes the file's presets over the open ones and leaves every other preset alone", () => {
    const file = readPresetFile(join(encodePresetMessages(edited(), [C1])));
    const merged = mergePresets(factory(), file.config, file.presets);
    expect(changedPresets(factory(), merged)).toEqual([C1]);
    expect(merged.presets[C1]).toEqual(edited().presets[C1]);
    expect(merged.globalFields).toEqual(factory().globalFields);
  });

  it("sets only what the file's messages address, as the Pacer would", () => {
    // Two messages out of C1's 189: its name, and step 1 of switch 1. Everything else on C1 —
    // the other switches, the lights, the load-time MIDI — isn't mentioned, so it stays.
    // A message is F0, the 4 id bytes, cmd, tgt, idx, then obj and elm.
    const wanted = encodePresetMessages(edited(), [C1]).filter(
      (m) => m[8] === ControlId.Name || (m[8] === ControlId.Stompswitch1 && m[9] === 0x01),
    );
    expect(wanted).toHaveLength(2);
    const file = readPresetFile(join(wanted));
    expect(file.presets).toEqual([C1]);

    const merged = mergePresets(factory(), file.config, file.presets);
    expect(merged.presets[C1]).toEqual(edited().presets[C1]);
  });

  it("brings in only the presets asked for, and says which of them would change", () => {
    let both = edited();
    both = renamePreset(both, D6, "OTHER");
    const file = readPresetFile(encodeSysex(both));
    // A whole dump from an AI that changed two presets: those two are what differ.
    expect(presetsMergeWouldChange(factory(), file.config, file.presets)).toEqual([C1, D6]);

    const merged = mergePresets(factory(), file.config, [C1]);
    expect(changedPresets(factory(), merged)).toEqual([C1]);
    expect(merged.presets[D6]?.name).toBe(factory().presets[D6]?.name);
  });

  it("never brings in the Current slot", () => {
    const file = readPresetFile(encodeSysex(edited()));
    const merged = mergePresets(factory(), { ...file.config, presets: { 0: edited().presets[C1]! } }, [0]);
    expect(merged.presets[0]).toEqual(factory().presets[0]);
  });
});
