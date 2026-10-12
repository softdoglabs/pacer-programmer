// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ControlId,
  ControlMode,
  SwitchMessageType,
  presetSelectTargetToIndex,
  userPresetIndex,
} from "../../protocol/constants";
import { decodeSysex } from "../../protocol/decode";
import { encodeSysex } from "../../protocol/encode";
import {
  checkPresetName,
  normalizePresetName,
  renamePreset,
  setControlMode,
  setJump,
  setStepType,
  updateStep,
  updateStepLed,
} from "../edits";

const factory = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
const A1 = userPresetIndex(0, 1);
const S1 = ControlId.Stompswitch1;

describe("editing", () => {
  it("returns a new config and leaves the original and untouched presets alone", () => {
    const edited = renamePreset(factory, A1, "LOOP");
    expect(edited).not.toBe(factory);
    expect(factory.presets[A1]!.name).toBe("PRGM1");
    expect(edited.presets[A1]!.name).toBe("LOOP ");
    expect(edited.presets[A1 + 1]).toBe(factory.presets[A1 + 1]); // structurally shared
  });

  it("normalizes names: printable ASCII, uppercase, at most 5 characters, padded to 5", () => {
    // No dump has ever held a lowercase name, and the display is a 14-segment module.
    expect(normalizePresetName("looper!")).toBe("LOOPE");
    expect(normalizePresetName("AéB")).toBe("AB   ");
    expect(normalizePresetName("")).toBe("     ");
  });

  it("checks a typed name: too long or unstorable is an error, an unusual character a warning", () => {
    expect(checkPresetName("LOOPR")).toEqual({ name: "LOOPR" });
    expect(checkPresetName("loop")).toEqual({ name: "LOOP " }); // lowercase is just uppercased
    expect(checkPresetName("G-MST")).toEqual({ name: "G-MST" });
    expect(checkPresetName("LOOPER")).toMatchObject({ error: expect.stringMatching(/5 characters/) });
    expect(checkPresetName("A\u0001B")).toMatchObject({ error: expect.stringMatching(/printable ASCII/) });
    // Storable, but no Pacer name has ever used it, and the display may not render it.
    expect(checkPresetName("A*B")).toMatchObject({ name: "A*B  ", warning: expect.stringContaining("*") });
  });

  it("sets control mode, and patches steps with values clamped to the MIDI range", () => {
    let c = setControlMode(factory, A1, S1, ControlMode.Sequence);
    expect(c.presets[A1]!.controls[S1]!.controlMode).toBe(ControlMode.Sequence);
    c = updateStep(c, A1, S1, 2, { data: [200, -5, 64.4], channel: 99 });
    expect(c.presets[A1]!.controls[S1]!.steps[2]).toMatchObject({ data: [127, 0, 64], channel: 16 });
  });

  it("won't deactivate step 1 (every control keeps at least one step)", () => {
    const c = updateStep(factory, A1, S1, 1, { active: false });
    expect(c.presets[A1]!.controls[S1]!.steps[1]!.active).toBe(true);
    expect(updateStep(factory, A1, S1, 2, { active: true }).presets[A1]!.controls[S1]!.steps[2]!.active).toBe(true);
  });

  it("changing type resets data to that type's defaults and turns the step on (except Off)", () => {
    let c = setStepType(factory, A1, S1, 2, "switch", SwitchMessageType.CcToggle);
    expect(c.presets[A1]!.controls[S1]!.steps[2]).toMatchObject({
      msgType: SwitchMessageType.CcToggle,
      data: [0, 0, 127],
      active: true,
    });
    c = updateStep(c, A1, S1, 2, { data: [64, 0, 127] });
    c = setStepType(c, A1, S1, 2, "switch", SwitchMessageType.CcTrigger); // keeps the controller
    expect(c.presets[A1]!.controls[S1]!.steps[2]!.data).toEqual([64, 127, 0]);
    c = setStepType(c, A1, S1, 3, "switch", SwitchMessageType.Off);
    expect(c.presets[A1]!.controls[S1]!.steps[3]!.active).toBe(false);
  });

  it("edits LED config, creating it with Default colors when missing", () => {
    const c = updateStepLed(factory, A1, ControlId.Footswitch1, 1, { activeColor: 0x03 });
    expect(c.presets[A1]!.controls[ControlId.Footswitch1]!.led[1]).toEqual({
      midiFeedback: 0,
      activeColor: 0x03,
      inactiveColor: 0x7f,
      position: 0,
    });
  });

  it("edited configs still encode and decode losslessly", () => {
    let c = renamePreset(factory, A1, "LOOPR");
    c = setStepType(c, A1, ControlId.StompswitchA, 2, "switch", SwitchMessageType.PresetSelect);
    c = updateStepLed(c, A1, ControlId.StompswitchA, 2, { activeColor: 0x17, inactiveColor: 0x18, position: 1 });
    c = setControlMode(c, A1, S1, ControlMode.Sequence);
    expect(decodeSysex(encodeSysex(c))).toEqual(c);
  });

  it("rejects step numbers outside 1-6", () => {
    expect(() => updateStep(factory, A1, S1, 7, { active: true })).toThrow(RangeError);
  });
});

describe("setJump", () => {
  it("makes a step a Preset Select to a user preset, switched on", () => {
    const config = factory;
    const A1 = userPresetIndex(0, 1);
    const D6 = userPresetIndex(3, 6);
    const jumped = setJump(config, A1, ControlId.Stompswitch3, 2, D6);
    const step = jumped.presets[A1]?.controls[ControlId.Stompswitch3]?.steps[2];
    expect(step?.msgType).toBe(SwitchMessageType.PresetSelect);
    expect(step?.active).toBe(true);
    expect(presetSelectTargetToIndex(step!.data[0])).toBe(D6);
  });
});
