// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ControlId, PresetMidiMessageType, userPresetIndex } from "../../protocol/constants";
import { decodeSysex } from "../../protocol/decode";
import { createEmptyPacerConfig, getOrCreatePreset } from "../../protocol/types";
import { applyBoardEvent, changePreset, createBoardState } from "../engine";
import { presetLoadEffect } from "../presetLoad";

const factory = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
const A1 = userPresetIndex(0, 1);
const A5 = userPresetIndex(0, 5); // "NOTES": sends All Notes Off on every channel as it loads

describe("what a preset fires when it loads", () => {
  it("reads the factory NOTES preset's 16 messages", () => {
    const { messages, relayActions } = presetLoadEffect(factory, A5);
    expect(relayActions).toEqual([]);
    expect(messages).toHaveLength(16);
    // Channels are 0-based on the wire: the setting's channel 1 is wire channel 0.
    expect(messages[0]).toEqual({ kind: "controlChange", channel: 0, controller: 123, value: 127 });
    expect(messages[15]).toEqual({ kind: "controlChange", channel: 15, controller: 123, value: 127 });
  });

  it("sends nothing for a preset whose slots are all Off", () => {
    expect(presetLoadEffect(factory, A1)).toEqual({ messages: [], relayActions: [] });
  });

  it("uses the preset's own byte layout, not a step's", () => {
    // A preset CC is (controller, value). A step's CC Toggle reads the same three bytes as
    // (controller, press 1, press 2), so getting these tables crossed sends the wrong value.
    const config = createEmptyPacerConfig();
    const preset = getOrCreatePreset(config, A1);
    preset.midiSettings[1] = { channel: 3, msgType: PresetMidiMessageType.Cc, data: [52, 64, 127] };
    expect(presetLoadEffect(config, A1).messages).toEqual([
      { kind: "controlChange", channel: 2, controller: 52, value: 64 },
    ]);
  });

  it("fires on a recall, and the messages update the remembered values", () => {
    const board = createBoardState(factory, A1);
    const { board: next, effect } = changePreset(board, A5);
    expect(effect.messages).toHaveLength(16);
    expect(next.midi.cc[0]?.[123]).toBe(127);
  });

  it("fires after the press that jumped there, not before it", () => {
    // Switch C on A1 steps to the previous preset, so pressing it from A6 lands on A5.
    const board = createBoardState(factory, userPresetIndex(0, 6));
    const { board: next, effect } = applyBoardEvent(board, { controlId: ControlId.StompswitchC, phase: "press" });
    expect(next.activePresetIndex).toBe(A5);
    expect(effect.presetChanged).toEqual({ from: userPresetIndex(0, 6), to: A5 });
    expect(effect.messages).toHaveLength(16); // the jump itself sends nothing on the wire
    expect(effect.messages[0]).toMatchObject({ controller: 123 });
  });

  it("stays silent when a configuration is merely loaded", () => {
    // Opening a file isn't a recall: nothing should reach the wire until something recalls a preset.
    expect(createBoardState(factory, A5).midi.cc).toEqual({});
  });
});
