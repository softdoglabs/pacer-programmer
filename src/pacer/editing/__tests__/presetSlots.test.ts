// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ControlId, PresetMidiMessageType, SwitchMessageType, userPresetIndex } from "../../protocol/constants";
import { decodeSysex } from "../../protocol/decode";
import { encodePresetMessages } from "../../protocol/encode";
import type { SwitchControl } from "../../protocol/types";
import { clearPreset, copyPreset, isSparePreset, SPARE_PRESET_NAME } from "../presetSlots";

const factory = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
const A1 = userPresetIndex(0, 1);
const A2 = userPresetIndex(0, 2);

describe("spare slots", () => {
  it("counts nothing on a real device as spare", () => {
    // Every factory preset does something: switches send, A and B select the DAW presets.
    for (let i = 1; i <= 24; i++) expect(isSparePreset(factory.presets[i])).toBe(false);
  });

  it("clears a preset to Off in place, not by dropping what's there", () => {
    const cleared = clearPreset(factory, A1);
    expect(isSparePreset(cleared.presets[A1])).toBe(true);
    expect(cleared.presets[A1]?.name).toBe(SPARE_PRESET_NAME);

    /*
     * The device keeps whatever a message doesn't address, so a preset emptied by deleting its
     * fields would leave the hardware exactly as it was. Every field it had is still there, set
     * to Off, so the same number of messages goes out and the slot really ends up empty.
     */
    const before = encodePresetMessages(factory, [A1]).length;
    expect(encodePresetMessages(cleared, [A1]).length).toBe(before);
    const step = cleared.presets[A1]?.controls[ControlId.Stompswitch1]?.steps[1];
    expect(step?.msgType).toBe(SwitchMessageType.Off);
    expect(step?.active).toBe(true); // step 1 stays on; the hardware's own menu won't turn it off
    expect(cleared.presets[A1]?.midiSettings[1]?.msgType).toBe(PresetMidiMessageType.Off);
  });

  it("treats a preset left with only its next/previous stepping as spare", () => {
    // What the hardware leaves when someone empties a preset from the front panel: C and D still
    // walk to the neighbours, and nothing else happens.
    const cleared = clearPreset(factory, A2);
    const stepping = {
      ...cleared,
      presets: {
        ...cleared.presets,
        [A2]: {
          ...cleared.presets[A2]!,
          controls: {
            ...cleared.presets[A2]!.controls,
            [ControlId.StompswitchD]: {
              steps: { 1: { channel: 0, msgType: SwitchMessageType.PresetIncDec, data: [0, 0, 0], active: true } },
              led: {},
            } satisfies SwitchControl,
          },
        },
      },
    };
    expect(isSparePreset(stepping.presets[A2])).toBe(true);
  });

  it("copies a preset into another slot, which keeps its own number", () => {
    const copied = copyPreset(factory, A1, A2);
    expect(copied.presets[A2]?.name).toBe(factory.presets[A1]?.name);
    expect(copied.presets[A2]?.index).toBe(A2);
    expect(copied.presets[A1]).toBe(factory.presets[A1]); // the original is untouched
  });
});
