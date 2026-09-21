import { describe, expect, it } from "vitest";
import { ExpressionMessageType, SwitchMessageType } from "../../protocol/constants";
import type { Step } from "../../protocol/types";
import { EMPTY_MIDI_STATE, recordMidi } from "../midiState";
import { fireExpressionStep, fireSwitchStep, type StepSubState } from "../stepEffects";

/** Wire channel passed to the step functions (they no longer read step.channel). */
const WIRE_CHANNEL = 1;

function step(msgType: number, data: [number, number, number], channel = 1, active = true): Step {
  return { channel, msgType, data, active };
}

const noSubState: StepSubState = { midi: EMPTY_MIDI_STATE };

describe("fireSwitchStep", () => {
  it("Off does nothing on either phase", () => {
    const s = step(SwitchMessageType.Off, [0, 0, 0]);
    expect(fireSwitchStep(s, "press", noSubState, WIRE_CHANNEL)).toEqual({
      messages: [],
      deviceActions: [],
      warnings: [],
    });
    expect(fireSwitchStep(s, "release", noSubState, WIRE_CHANNEL)).toEqual({
      messages: [],
      deviceActions: [],
      warnings: [],
    });
  });

  it("CcTrigger sends 'down' on press and 'up' on release", () => {
    const s = step(SwitchMessageType.CcTrigger, [20, 127, 0]);
    expect(fireSwitchStep(s, "press", noSubState, WIRE_CHANNEL).messages).toEqual([
      { kind: "controlChange", channel: 1, controller: 20, value: 127 },
    ]);
    expect(fireSwitchStep(s, "release", noSubState, WIRE_CHANNEL).messages).toEqual([
      { kind: "controlChange", channel: 1, controller: 20, value: 0 },
    ]);
  });

  it("CcToggle follows the remembered CC value: sends On unless the CC is already On, press only", () => {
    const s = step(SwitchMessageType.CcToggle, [10, 0, 127]);
    const first = fireSwitchStep(s, "press", noSubState, WIRE_CHANNEL);
    expect(first.messages).toEqual([{ kind: "controlChange", channel: 1, controller: 10, value: 127 }]);
    expect(first.runtimePatch).toBeUndefined();

    const midi = recordMidi(EMPTY_MIDI_STATE, first.messages);
    const second = fireSwitchStep(s, "press", { midi }, WIRE_CHANNEL);
    expect(second.messages).toEqual([{ kind: "controlChange", channel: 1, controller: 10, value: 0 }]);

    expect(fireSwitchStep(s, "release", noSubState, WIRE_CHANNEL)).toEqual({
      messages: [],
      deviceActions: [],
      warnings: [],
    });
  });

  it("CcStep steps from start to end and wraps, one value per press, nothing on release", () => {
    const s = step(SwitchMessageType.CcStep, [5, 10, 12]);
    let sub: StepSubState = noSubState;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      const result = fireSwitchStep(s, "press", sub, WIRE_CHANNEL);
      seen.push((result.messages[0] as { value: number }).value);
      sub = { ...sub, counter: result.runtimePatch!.counter };
    }
    expect(seen).toEqual([10, 11, 12, 10]);
    expect(fireSwitchStep(s, "release", sub, WIRE_CHANNEL)).toEqual({ messages: [], deviceActions: [], warnings: [] });
  });

  it("Note sends NoteOn on press and NoteOff(velocity 0) on release", () => {
    const s = step(SwitchMessageType.Note, [60, 100, 0]);
    expect(fireSwitchStep(s, "press", noSubState, WIRE_CHANNEL).messages).toEqual([
      { kind: "noteOn", channel: 1, note: 60, velocity: 100 },
    ]);
    expect(fireSwitchStep(s, "release", noSubState, WIRE_CHANNEL).messages).toEqual([
      { kind: "noteOff", channel: 1, note: 60, velocity: 0 },
    ]);
  });

  it("NoteToggle follows the remembered note: NoteOff if it's sounding, else NoteOn; press only", () => {
    const s = step(SwitchMessageType.NoteToggle, [64, 90, 0]);
    const first = fireSwitchStep(s, "press", noSubState, WIRE_CHANNEL);
    expect(first.messages).toEqual([{ kind: "noteOn", channel: 1, note: 64, velocity: 90 }]);
    const second = fireSwitchStep(s, "press", { midi: recordMidi(EMPTY_MIDI_STATE, first.messages) }, WIRE_CHANNEL);
    expect(second.messages).toEqual([{ kind: "noteOff", channel: 1, note: 64, velocity: 0 }]);
    expect(fireSwitchStep(s, "release", noSubState, WIRE_CHANNEL)).toEqual({
      messages: [],
      deviceActions: [],
      warnings: [],
    });
  });

  it("ProgramAndBank sends only Program Change when bank bytes are both zero", () => {
    const s = step(SwitchMessageType.ProgramAndBank, [5, 0, 0]);
    expect(fireSwitchStep(s, "press", noSubState, WIRE_CHANNEL).messages).toEqual([
      { kind: "programChange", channel: 1, program: 5 },
    ]);
  });

  it("ProgramAndBank sends Bank LSB, Bank MSB, then Program Change when a bank byte is set", () => {
    const s = step(SwitchMessageType.ProgramAndBank, [5, 2, 1]);
    expect(fireSwitchStep(s, "press", noSubState, WIRE_CHANNEL).messages).toEqual([
      { kind: "controlChange", channel: 1, controller: 32, value: 2 },
      { kind: "controlChange", channel: 1, controller: 0, value: 1 },
      { kind: "programChange", channel: 1, program: 5 },
    ]);
  });

  it("ProgramStep uses data[1]/data[2] as start/end (data[0] unused) and wraps", () => {
    const s = step(SwitchMessageType.ProgramStep, [0, 0, 2]);
    let sub: StepSubState = noSubState;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      const result = fireSwitchStep(s, "press", sub, WIRE_CHANNEL);
      seen.push((result.messages[0] as { program: number }).program);
      sub = { ...sub, counter: result.runtimePatch!.counter };
    }
    expect(seen).toEqual([0, 1, 2, 0]);
  });

  it("NrpnCoarse sends CC99(MSB), CC98(LSB), CC6(value)", () => {
    const s = step(SwitchMessageType.NrpnCoarse, [64, 3, 2]);
    expect(fireSwitchStep(s, "press", noSubState, WIRE_CHANNEL).messages).toEqual([
      { kind: "controlChange", channel: 1, controller: 99, value: 2 },
      { kind: "controlChange", channel: 1, controller: 98, value: 3 },
      { kind: "controlChange", channel: 1, controller: 6, value: 64 },
    ]);
  });

  it("NrpnFine sends CC99(MSB), CC98(LSB), CC38(value)", () => {
    const s = step(SwitchMessageType.NrpnFine, [64, 3, 2]);
    expect(fireSwitchStep(s, "press", noSubState, WIRE_CHANNEL).messages).toEqual([
      { kind: "controlChange", channel: 1, controller: 99, value: 2 },
      { kind: "controlChange", channel: 1, controller: 98, value: 3 },
      { kind: "controlChange", channel: 1, controller: 38, value: 64 },
    ]);
  });

  it("Mmc fires deviceId/command on press, nothing on release", () => {
    const s = step(SwitchMessageType.Mmc, [0x7f, 2, 0]);
    expect(fireSwitchStep(s, "press", noSubState, WIRE_CHANNEL).messages).toEqual([
      { kind: "mmc", deviceId: 0x7f, command: 2 },
    ]);
    expect(fireSwitchStep(s, "release", noSubState, WIRE_CHANNEL)).toEqual({
      messages: [],
      deviceActions: [],
      warnings: [],
    });
  });

  it("Relay produces a device action, never a MIDI message", () => {
    const s = step(SwitchMessageType.Relay, [3, 1, 0]);
    const result = fireSwitchStep(s, "press", noSubState, WIRE_CHANNEL);
    expect(result.messages).toEqual([]);
    expect(result.deviceActions).toEqual([{ kind: "relay", relayIndex: 1, mode: 3 }]);
  });

  it("PresetSelect warns and no-ops for target 0 (current)", () => {
    const result = fireSwitchStep(step(SwitchMessageType.PresetSelect, [0, 0, 0]), "press", noSubState, WIRE_CHANNEL);
    expect(result.deviceActions).toEqual([]);
    expect(result.warnings.length).toBe(1);
  });

  it("PresetSelect targets 1/2 request the built-in Track/Transport presets", () => {
    expect(
      fireSwitchStep(step(SwitchMessageType.PresetSelect, [1, 0, 0]), "press", noSubState, WIRE_CHANNEL).deviceActions,
    ).toEqual([{ kind: "specialPreset", preset: "track" }]);
    expect(
      fireSwitchStep(step(SwitchMessageType.PresetSelect, [2, 0, 0]), "press", noSubState, WIRE_CHANNEL).deviceActions,
    ).toEqual([{ kind: "specialPreset", preset: "transport" }]);
  });

  it("PresetSelect targets 3..26 jump to A1..D6 (SysEx idx 1..24)", () => {
    const s = step(SwitchMessageType.PresetSelect, [3, 0, 0]); // A1
    expect(fireSwitchStep(s, "press", noSubState, WIRE_CHANNEL).deviceActions).toEqual([
      { kind: "presetJump", targetIndex: 1 },
    ]);

    const last = step(SwitchMessageType.PresetSelect, [26, 0, 0]); // D6
    expect(fireSwitchStep(last, "press", noSubState, WIRE_CHANNEL).deviceActions).toEqual([
      { kind: "presetJump", targetIndex: 24 },
    ]);

    const outOfRange = step(SwitchMessageType.PresetSelect, [27, 0, 0]);
    expect(fireSwitchStep(outOfRange, "press", noSubState, WIRE_CHANNEL).warnings.length).toBe(1);
  });

  it("PresetIncDec: 0 -> next, nonzero -> prev", () => {
    const next = step(SwitchMessageType.PresetIncDec, [0, 0, 0]);
    expect(fireSwitchStep(next, "press", noSubState, WIRE_CHANNEL).deviceActions).toEqual([
      { kind: "presetRelative", direction: "next" },
    ]);
    const prev = step(SwitchMessageType.PresetIncDec, [1, 0, 0]);
    expect(fireSwitchStep(prev, "press", noSubState, WIRE_CHANNEL).deviceActions).toEqual([
      { kind: "presetRelative", direction: "prev" },
    ]);
  });

  it("StepSelect and StepIncDec always warn and no-op (deferred feature)", () => {
    for (const msgType of [SwitchMessageType.StepSelect, SwitchMessageType.StepIncDec]) {
      const s = step(msgType, [0, 0, 0]);
      const result = fireSwitchStep(s, "press", noSubState, WIRE_CHANNEL);
      expect(result.messages).toEqual([]);
      expect(result.deviceActions).toEqual([]);
      expect(result.warnings.length).toBe(1);
    }
  });
});

describe("fireExpressionStep", () => {
  it("Off does nothing", () => {
    const s = step(ExpressionMessageType.Off, [0, 0, 0]);
    expect(fireExpressionStep(s, "press", noSubState, WIRE_CHANNEL)).toEqual({
      messages: [],
      deviceActions: [],
      warnings: [],
    });
  });

  it("MidiCc sends max on press, min on release", () => {
    const s = step(ExpressionMessageType.MidiCc, [11, 0, 127]);
    expect(fireExpressionStep(s, "press", noSubState, WIRE_CHANNEL).messages).toEqual([
      { kind: "controlChange", channel: 1, controller: 11, value: 127 },
    ]);
    expect(fireExpressionStep(s, "release", noSubState, WIRE_CHANNEL).messages).toEqual([
      { kind: "controlChange", channel: 1, controller: 11, value: 0 },
    ]);
  });

  it("PitchBend and ChannelAftertouch use data[1]/data[2] (data[0] unused)", () => {
    const pb = step(ExpressionMessageType.PitchBend, [0, 0, 16383]);
    expect(fireExpressionStep(pb, "press", noSubState, WIRE_CHANNEL).messages).toEqual([
      { kind: "pitchBend", channel: 1, value14: 16383 },
    ]);
    const at = step(ExpressionMessageType.ChannelAftertouch, [0, 0, 127]);
    expect(fireExpressionStep(at, "press", noSubState, WIRE_CHANNEL).messages).toEqual([
      { kind: "channelAftertouch", channel: 1, value: 127 },
    ]);
  });

  it("NrpnCoarse/Fine fire on press only, nothing on release (no documented 'min' to fall back to)", () => {
    const coarse = step(ExpressionMessageType.NrpnCoarse, [100, 1, 2]);
    expect(fireExpressionStep(coarse, "press", noSubState, WIRE_CHANNEL).messages.length).toBe(3);
    expect(fireExpressionStep(coarse, "release", noSubState, WIRE_CHANNEL)).toEqual({
      messages: [],
      deviceActions: [],
      warnings: [],
    });
  });
});
