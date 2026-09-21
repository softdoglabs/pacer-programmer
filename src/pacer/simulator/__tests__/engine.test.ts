import { describe, expect, it } from "vitest";
import { ControlId, SwitchMessageType, presetIndexToPresetSelectTarget, userPresetIndex } from "../../protocol/constants";
import { createEmptyPacerConfig, getOrCreateControl, getOrCreatePreset, type PacerConfig } from "../../protocol/types";
import { applyBoardEvent, createBoardState, getActiveControlIds, getControlDisplayState } from "../engine";

function ccToggleStep(controller: number, value1: number, value2: number) {
  return { channel: 1, msgType: SwitchMessageType.CcToggle, data: [controller, value1, value2] as [number, number, number], active: true };
}

function programAndBankStep(program: number) {
  return { channel: 1, msgType: SwitchMessageType.ProgramAndBank, data: [program, 0, 0] as [number, number, number], active: true };
}

function presetSelectStep(targetIndex: number) {
  const target = presetIndexToPresetSelectTarget(targetIndex);
  return { channel: 1, msgType: SwitchMessageType.PresetSelect, data: [target, 0, 0] as [number, number, number], active: true };
}

const A1 = userPresetIndex(0, 1);
const A2 = userPresetIndex(0, 2);
const D6 = userPresetIndex(3, 6);

function presetIncDecStep(direction: 0 | 1) {
  return { channel: 1, msgType: SwitchMessageType.PresetIncDec, data: [direction, 0, 0] as [number, number, number], active: true };
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
    expect(getControlDisplayState(boardWithToggle, ControlId.Stompswitch1).activeToggleSteps).toEqual([1]);

    const { board: boardAfterJump, effect } = applyBoardEvent(boardWithToggle, { controlId: ControlId.StompswitchA, phase: "press" });

    expect(effect.messages).toEqual([{ kind: "programChange", channel: 1, program: 5 }]);
    expect(effect.presetChanged).toEqual({ from: A1, to: A2 });
    expect(boardAfterJump.activePresetIndex).toBe(A2);
    expect(Object.keys(boardAfterJump.controls)).toEqual([]);
  });

  it("toggle state is reset (not restored) after jumping away and back", () => {
    const config = buildLooperConfig();
    let board = createBoardState(config, A1);
    board = applyBoardEvent(board, { controlId: ControlId.Stompswitch1, phase: "press" }).board;
    expect(getControlDisplayState(board, ControlId.Stompswitch1).activeToggleSteps).toEqual([1]);

    board = applyBoardEvent(board, { controlId: ControlId.StompswitchA, phase: "press" }).board; // -> A2
    board = applyBoardEvent(board, { controlId: ControlId.StompswitchA, phase: "press" }).board; // -> back to A1

    expect(board.activePresetIndex).toBe(A1);
    expect(getControlDisplayState(board, ControlId.Stompswitch1).activeToggleSteps).toEqual([]);
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

    const { board: prevBoard } = applyBoardEvent(createBoardState(config, A1), { controlId: ControlId.Footswitch1, phase: "press" });
    expect(prevBoard.activePresetIndex).toBe(D6);

    const { board: nextBoard } = applyBoardEvent(createBoardState(config, D6), { controlId: ControlId.Footswitch1, phase: "press" });
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
    expect(after).toBe(board);
  });
});
