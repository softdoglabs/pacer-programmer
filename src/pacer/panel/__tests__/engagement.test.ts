import { describe, expect, it } from "vitest";
import { SwitchMessageType, presetIndexToPresetSelectTarget, userPresetIndex } from "../../protocol/constants";
import type { Step } from "../../protocol/types";
import { stepLight, type StepContext } from "../engagement";

const A1 = userPresetIndex(0, 1);
const C1 = userPresetIndex(2, 1);
const idle: StepContext = {
  held: false,
  toggleOn: false,
  sentLastProgramChange: false,
  current: { kind: "user", index: A1 },
};
const step = (msgType: number, d0 = 0): Step => ({ channel: 0, msgType, data: [d0, 0, 0], active: true });

describe("stepLight (the firmware LED model)", () => {
  it("MIDI steps show On/Off by value state: toggle bit, last Program Change, or held", () => {
    const toggle = step(SwitchMessageType.CcToggle);
    expect(stepLight(toggle, { ...idle, toggleOn: true })).toEqual({ kind: "on" });
    expect(stepLight(toggle, { ...idle, held: true })).toEqual({ kind: "off" });
    const pc = step(SwitchMessageType.ProgramAndBank, 5);
    expect(stepLight(pc, { ...idle, sentLastProgramChange: true })).toEqual({ kind: "on" });
    expect(stepLight(pc, idle)).toEqual({ kind: "off" });
    for (const t of [SwitchMessageType.CcTrigger, SwitchMessageType.Note, SwitchMessageType.Mmc]) {
      expect(stepLight(step(t), { ...idle, held: true })).toEqual({ kind: "on" });
      expect(stepLight(step(t), idle)).toEqual({ kind: "off" });
    }
  });

  it("Preset Select to a user preset shows its On color steadily (observed: bright white on A1 and C1)", () => {
    const toC1 = step(SwitchMessageType.PresetSelect, presetIndexToPresetSelectTarget(C1));
    const toA1 = step(SwitchMessageType.PresetSelect, presetIndexToPresetSelectTarget(A1));
    expect(stepLight(toC1, idle)).toEqual({ kind: "on" });
    expect(stepLight(toA1, { ...idle, current: { kind: "user", index: C1 } })).toEqual({ kind: "on" });
  });

  it("Preset Select to Track/Transport is a mode indicator, lit only in that mode", () => {
    const toTrack = step(SwitchMessageType.PresetSelect, 1);
    const toTransport = step(SwitchMessageType.PresetSelect, 2);
    expect(stepLight(toTrack, idle)).toEqual({ kind: "modeIndicator", lit: false });
    expect(stepLight(toTrack, { ...idle, current: { kind: "special", preset: "track" } })).toEqual({
      kind: "modeIndicator",
      lit: true,
    });
    expect(stepLight(toTransport, { ...idle, current: { kind: "special", preset: "track" } })).toEqual({
      kind: "modeIndicator",
      lit: false,
    });
  });

  it("Preset Inc/Dec never lights, even while held", () => {
    expect(stepLight(step(SwitchMessageType.PresetIncDec), { ...idle, held: true })).toEqual({ kind: "dark" });
  });
});
