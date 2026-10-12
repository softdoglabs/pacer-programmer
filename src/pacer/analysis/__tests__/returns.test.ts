// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { describe, expect, it } from "vitest";
import {
  CURRENT_PRESET_INDEX,
  ControlId,
  SwitchMessageType,
  presetIndexToPresetSelectTarget,
  userPresetIndex,
} from "../../protocol/constants";
import { createEmptyPacerConfig, getOrCreateControl, getOrCreatePreset, type PacerConfig } from "../../protocol/types";
import { presetEntrants } from "../returns";

const A = (n: number) => userPresetIndex(0, n);

/** A preset with a note on stomp 1, so presets can be told apart by what they do. */
function preset(config: PacerConfig, index: number, name: string, note: number) {
  const p = getOrCreatePreset(config, index);
  p.name = name;
  getOrCreateControl(p, ControlId.Stompswitch1).steps[1] = {
    channel: 0,
    msgType: SwitchMessageType.Note,
    data: [note, 127, 0],
    active: true,
  };
}

function jump(config: PacerConfig, from: number, controlId: number, to: number) {
  getOrCreateControl(getOrCreatePreset(config, from), controlId).steps[1] = {
    channel: 0,
    msgType: SwitchMessageType.PresetSelect,
    data: [presetIndexToPresetSelectTarget(to), 0, 0],
    active: true,
  };
}

function step(config: PacerConfig, from: number, controlId: number, direction: 0 | 1) {
  getOrCreateControl(getOrCreatePreset(config, from), controlId).steps[1] = {
    channel: 0,
    msgType: SwitchMessageType.PresetIncDec,
    data: [direction, 0, 0],
    active: true,
  };
}

describe("what enters a preset", () => {
  it("is a switch that names it — not stepping, not the working copy, not itself", () => {
    const config = createEmptyPacerConfig();
    for (const n of [1, 2, 3]) preset(config, A(n), `P${n}`, 60 + n);
    jump(config, A(1), ControlId.StompswitchA, A(3)); // names A3: counts
    step(config, A(2), ControlId.StompswitchD, 0); // A2's "next" is A3: a direction, doesn't count
    jump(config, A(3), ControlId.StompswitchB, A(3)); // a reload of itself: doesn't count
    // The working copy of A1, as every real dump has: a second copy of A1's switches.
    preset(config, CURRENT_PRESET_INDEX, "P1", 61);
    jump(config, CURRENT_PRESET_INDEX, ControlId.StompswitchA, A(3));

    expect(presetEntrants(config, A(3))).toEqual([A(1)]);
  });
});
