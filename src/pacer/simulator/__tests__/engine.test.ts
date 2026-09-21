import { describe, expect, it } from "vitest";
import {
  ControlId,
  SwitchMessageType,
  presetIndexToPresetSelectTarget,
  userPresetIndex,
} from "../../protocol/constants";
import { createEmptyPacerConfig, getOrCreateControl, getOrCreatePreset, type PacerConfig } from "../../protocol/types";
import {
  applyBoardEvent,
  changePreset,
  createBoardState,
  getActiveControlIds,
  getControlDisplayState,
  resetMidiState,
} from "../engine";
import { EMPTY_MIDI_STATE } from "../midiState";
import { midiMessageToBytes } from "../midiMessages";

function ccToggleStep(controller: number, value1: number, value2: number) {
  return {
    channel: 1,
    msgType: SwitchMessageType.CcToggle,
    data: [controller, value1, value2] as [number, number, number],
    active: true,
  };
}

function programAndBankStep(program: number) {
  return {
    channel: 1,
    msgType: SwitchMessageType.ProgramAndBank,
    data: [program, 0, 0] as [number, number, number],
    active: true,
  };
}

function presetSelectStep(targetIndex: number) {
  const target = presetIndexToPresetSelectTarget(targetIndex);
  return {
    channel: 1,
    msgType: SwitchMessageType.PresetSelect,
    data: [target, 0, 0] as [number, number, number],
    active: true,
  };
}

const A1 = userPresetIndex(0, 1);
const A2 = userPresetIndex(0, 2);
const D6 = userPresetIndex(3, 6);

function presetIncDecStep(direction: 0 | 1) {
  return {
    channel: 1,
    msgType: SwitchMessageType.PresetIncDec,
    data: [direction, 0, 0] as [number, number, number],
    active: true,
  };
}

/**
 * A miniature version of CLAUDE.md's looper pattern: A1's Stompswitch A both sends a
 * Program Change AND jumps to A2; A2's Stompswitch A jumps back. A1's
 * Stompswitch 1 is an unrelated CcToggle control, used to prove runtime state resets on jump.
 */
function buildLooperConfig(): PacerConfig {
  const config = createEmptyPacerConfig();

  const preset0 = getOrCreatePreset(config, A1);
  const toggle0 = getOrCreateControl(preset0, ControlId.Stompswitch1);
  toggle0.steps[1] = ccToggleStep(10, 0, 127);

  const jumpForward = getOrCreateControl(preset0, ControlId.StompswitchA);
  jumpForward.steps[1] = programAndBankStep(5);
  jumpForward.steps[2] = presetSelectStep(A2);

  const preset1 = getOrCreatePreset(config, A2);
  const jumpBack = getOrCreateControl(preset1, ControlId.StompswitchA);
  jumpBack.steps[1] = presetSelectStep(A1);

  return config;
}

describe("applyBoardEvent — preset navigation", () => {
  it("PresetSelect + ProgramAndBank together: emits the MIDI, changes preset, and resets other controls' runtime state", () => {
    const config = buildLooperConfig();
    const board0 = createBoardState(config, A1);

    // Set some toggle state on an unrelated control first.
    const { board: boardWithToggle } = applyBoardEvent(board0, { controlId: ControlId.Stompswitch1, phase: "press" });
    expect(getControlDisplayState(boardWithToggle, ControlId.Stompswitch1).valueOnSteps).toEqual([1]);

    const { board: boardAfterJump, effect } = applyBoardEvent(boardWithToggle, {
      controlId: ControlId.StompswitchA,
      phase: "press",
    });

    expect(effect.messages).toEqual([{ kind: "programChange", channel: 0, program: 5 }]);
    expect(effect.presetChanged).toEqual({ from: A1, to: A2 });
    expect(boardAfterJump.activePresetIndex).toBe(A2);
    expect(Object.keys(boardAfterJump.controls)).toEqual([]);
  });

  it("toggle state survives jumping away and back (it's the device's remembered CC value)", () => {
    const config = buildLooperConfig();
    let board = createBoardState(config, A1);
    board = applyBoardEvent(board, { controlId: ControlId.Stompswitch1, phase: "press" }).board;
    expect(getControlDisplayState(board, ControlId.Stompswitch1).valueOnSteps).toEqual([1]);

    board = applyBoardEvent(board, { controlId: ControlId.StompswitchA, phase: "press" }).board; // -> A2
    board = applyBoardEvent(board, { controlId: ControlId.StompswitchA, phase: "press" }).board; // -> back to A1

    expect(board.activePresetIndex).toBe(A1);
    expect(getControlDisplayState(board, ControlId.Stompswitch1).valueOnSteps).toEqual([1]);
    // ...so the next press toggles it off rather than sending On again.
    const { effect } = applyBoardEvent(board, { controlId: ControlId.Stompswitch1, phase: "press" });
    expect(effect.messages).toEqual([{ kind: "controlChange", channel: 0, controller: 10, value: 0 }]);
  });

  it("a release addressed to a control after its press changed the preset is a no-op, not a crash", () => {
    const config = buildLooperConfig();
    const board0 = createBoardState(config, A1);
    const { board: boardAfterJump } = applyBoardEvent(board0, { controlId: ControlId.StompswitchA, phase: "press" });

    // A2 also defines StompswitchA, but its fresh runtime state (post-reset) is unpressed.
    const { effect } = applyBoardEvent(boardAfterJump, { controlId: ControlId.StompswitchA, phase: "release" });
    expect(effect.messages).toEqual([]);
    expect(effect.warnings.length).toBe(1);
  });

  it("PresetIncDec wraps within A1..D6, never landing on the Current slot", () => {
    const config = createEmptyPacerConfig();
    const first = getOrCreatePreset(config, A1);
    getOrCreateControl(first, ControlId.Footswitch1).steps[1] = presetIncDecStep(1); // prev

    const last = getOrCreatePreset(config, D6);
    getOrCreateControl(last, ControlId.Footswitch1).steps[1] = presetIncDecStep(0); // next

    const { board: prevBoard } = applyBoardEvent(createBoardState(config, A1), {
      controlId: ControlId.Footswitch1,
      phase: "press",
    });
    expect(prevBoard.activePresetIndex).toBe(D6);

    const { board: nextBoard } = applyBoardEvent(createBoardState(config, D6), {
      controlId: ControlId.Footswitch1,
      phase: "press",
    });
    expect(nextBoard.activePresetIndex).toBe(A1);
  });
});

describe("applyBoardEvent — guards", () => {
  it("warns and leaves the board unchanged for a control not configured on the active preset", () => {
    const config = createEmptyPacerConfig();
    getOrCreatePreset(config, A1);
    const board = createBoardState(config, A1);
    const { board: nextBoard, effect } = applyBoardEvent(board, { controlId: ControlId.Footswitch1, phase: "press" });
    expect(nextBoard).toBe(board);
    expect(effect.warnings.length).toBe(1);
  });

  it("warns for a control id that isn't a switch or expression pedal at all", () => {
    const config = createEmptyPacerConfig();
    const board = createBoardState(config, A1);
    const { effect } = applyBoardEvent(board, { controlId: ControlId.Midi, phase: "press" });
    expect(effect.warnings.length).toBe(1);
  });
});

describe("getActiveControlIds / getControlDisplayState", () => {
  it("lists only controls actually defined on the active preset", () => {
    const config = buildLooperConfig();
    const board = createBoardState(config, A1);
    expect(getActiveControlIds(board)).toEqual([ControlId.Stompswitch1, ControlId.StompswitchA]);
    expect(getActiveControlIds(createBoardState(config, A2))).toEqual([ControlId.StompswitchA]);
  });

  it("reports exists:false for a control absent from the active preset", () => {
    const config = buildLooperConfig();
    const board = createBoardState(config, A1);
    expect(getControlDisplayState(board, ControlId.Footswitch1).exists).toBe(false);
  });
});

describe("applyBoardEvent: built-in Track/Transport presets", () => {
  it("requests the special preset and leaves the board (the preset to return to) untouched", () => {
    const config = createEmptyPacerConfig();
    const preset = getOrCreatePreset(config, 4);
    getOrCreateControl(preset, ControlId.Stompswitch1).steps[1] = ccToggleStep(10, 0, 127);
    getOrCreateControl(preset, ControlId.StompswitchA).steps[1] = {
      channel: 0,
      msgType: SwitchMessageType.PresetSelect,
      data: [1, 0, 0], // reserved target 1 = "track"
      active: true,
    };

    let board = createBoardState(config, 4);
    board = applyBoardEvent(board, { controlId: ControlId.Stompswitch1, phase: "press" }).board;
    const { board: after, effect } = applyBoardEvent(board, { controlId: ControlId.StompswitchA, phase: "press" });

    expect(effect.specialPresetRequested).toBe("track");
    expect(effect.presetChanged).toBeUndefined();
    expect(effect.warnings).toEqual([]);
    expect(after).toEqual(board); // same preset and runtime state to return to (it sent no MIDI)
  });
});

describe("applyBoardEvent: remembered MIDI state", () => {
  it("remembers the program per channel across preset changes, until reset", () => {
    const config = buildLooperConfig();
    const pc = getOrCreateControl(getOrCreatePreset(config, A1), ControlId.Stompswitch2);
    pc.steps[1] = programAndBankStep(7);

    let board = createBoardState(config, A1);
    expect(board.midi).toEqual(EMPTY_MIDI_STATE);
    board = applyBoardEvent(board, { controlId: ControlId.Stompswitch2, phase: "press" }).board;
    expect(board.midi.programs[0]).toMatchObject({ program: 7 });
    expect(getControlDisplayState(board, ControlId.Stompswitch2).valueOnSteps).toEqual([1]);

    board = applyBoardEvent(board, { controlId: ControlId.StompswitchA, phase: "press" }).board; // PC 5 + jump to A2
    expect(board.activePresetIndex).toBe(A2);
    expect(board.midi.programs[0]).toMatchObject({ program: 5 });

    board = changePreset(board, A1);
    expect(board.midi.programs[0]).toMatchObject({ program: 5 }); // survives the preset change
    expect(getControlDisplayState(board, ControlId.Stompswitch2).valueOnSteps).toEqual([]); // 7 isn't current

    expect(resetMidiState(board).midi).toEqual(EMPTY_MIDI_STATE);
  });

  it("records the MIDI a press sends even when it leaves for a DAW preset", () => {
    const config = createEmptyPacerConfig();
    const a = getOrCreateControl(getOrCreatePreset(config, A1), ControlId.StompswitchA);
    a.steps[1] = programAndBankStep(9);
    a.steps[2] = { channel: 1, msgType: SwitchMessageType.PresetSelect, data: [1, 0, 0], active: true }; // -> Track
    const { board, effect } = applyBoardEvent(createBoardState(config, A1), {
      controlId: ControlId.StompswitchA,
      phase: "press",
    });
    expect(effect.specialPresetRequested).toBe("track");
    expect(board.midi.programs[0]).toMatchObject({ program: 9 });
  });
});

describe("applyBoardEvent: MIDI channels", () => {
  function configWithChannel(channel: number, globalChannel?: number) {
    const config = createEmptyPacerConfig();
    getOrCreateControl(getOrCreatePreset(config, A1), ControlId.Stompswitch1).steps[1] = {
      channel,
      msgType: SwitchMessageType.ProgramAndBank,
      data: [7, 0, 0],
      active: true,
    };
    if (globalChannel !== undefined) {
      // Global Preset 1, Global Setting obj, Global Channel elm: [len, value]
      config.globalFields.push({ idx: 1, obj: 0x01, elm: 0x01, data: [1, globalChannel] });
    }
    return config;
  }
  const bytesFor = (channel: number, globalChannel?: number) => {
    const { effect } = applyBoardEvent(createBoardState(configWithChannel(channel, globalChannel), A1), {
      controlId: ControlId.Stompswitch1,
      phase: "press",
    });
    return effect.messages.map(midiMessageToBytes);
  };

  it("sends step channels 1-16 on MIDI channels 1-16 (wire nibbles 0-15)", () => {
    expect(bytesFor(1)).toEqual([[0xc0, 7]]);
    expect(bytesFor(10)).toEqual([[0xc9, 7]]);
    expect(bytesFor(16)).toEqual([[0xcf, 7]]);
  });

  it("sends channel 0 ('Global') on the config's global channel, defaulting to 1", () => {
    expect(bytesFor(0)).toEqual([[0xc0, 7]]);
    expect(bytesFor(0, 5)).toEqual([[0xc4, 7]]);
  });

  it("drops the MIDI and warns for an out-of-range channel byte", () => {
    const { effect } = applyBoardEvent(createBoardState(configWithChannel(17), A1), {
      controlId: ControlId.Stompswitch1,
      phase: "press",
    });
    expect(effect.messages).toEqual([]);
    expect(effect.warnings[0]).toMatch(/channel byte 17/);
  });
});
