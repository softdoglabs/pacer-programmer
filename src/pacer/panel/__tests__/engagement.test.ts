import { describe, expect, it } from "vitest";
import { SwitchMessageType, presetIndexToPresetSelectTarget, userPresetIndex } from "../../protocol/constants";
import type { Step } from "../../protocol/types";
import { isStepEngaged, type StepContext } from "../engagement";

const A1 = userPresetIndex(0, 1);
const idle: StepContext = {
  held: false,
  toggleOn: false,
  sentLastProgramChange: false,
  current: { kind: "user", index: A1 },
};
const step = (msgType: number, d0 = 0): Step => ({ channel: 0, msgType, data: [d0, 0, 0], active: true });

describe("isStepEngaged (the firmware LED model)", () => {
  it("toggles are engaged while toggled on, not while merely held", () => {
    const t = step(SwitchMessageType.CcToggle);
    expect(isStepEngaged(t, { ...idle, toggleOn: true })).toBe(true);
    expect(isStepEngaged(t, { ...idle, held: true })).toBe(false);
  });

  it("Program Change is engaged while its switch sent the last Program Change", () => {
    const pc = step(SwitchMessageType.ProgramAndBank, 5);
    expect(isStepEngaged(pc, { ...idle, sentLastProgramChange: true })).toBe(true);
    expect(isStepEngaged(pc, idle)).toBe(false);
  });

  it("Preset Select is engaged when its target is the current preset or mode", () => {
    const toA1 = step(SwitchMessageType.PresetSelect, presetIndexToPresetSelectTarget(A1));
    const toTrack = step(SwitchMessageType.PresetSelect, 1);
    const toTransport = step(SwitchMessageType.PresetSelect, 2);
    expect(isStepEngaged(toA1, idle)).toBe(true);
    expect(isStepEngaged(toA1, { ...idle, current: { kind: "user", index: A1 + 1 } })).toBe(false);
    expect(isStepEngaged(toTrack, idle)).toBe(false);
    expect(isStepEngaged(toTrack, { ...idle, current: { kind: "special", preset: "track" } })).toBe(true);
    expect(isStepEngaged(toTransport, { ...idle, current: { kind: "special", preset: "track" } })).toBe(false);
  });

  it("Preset Inc/Dec is never engaged, even while held", () => {
    expect(isStepEngaged(step(SwitchMessageType.PresetIncDec), { ...idle, held: true })).toBe(false);
  });

  it("momentary types are engaged while held", () => {
    for (const t of [SwitchMessageType.CcTrigger, SwitchMessageType.Note, SwitchMessageType.Mmc]) {
      expect(isStepEngaged(step(t), { ...idle, held: true })).toBe(true);
      expect(isStepEngaged(step(t), idle)).toBe(false);
    }
  });
});
