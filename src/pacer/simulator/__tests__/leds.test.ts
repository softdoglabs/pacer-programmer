import { describe, expect, it } from "vitest";
import { ControlId, ControlMode, FIRST_USER_PRESET_INDEX, SwitchMessageType } from "../../protocol/constants";
import { createEmptyPacerConfig, getOrCreateControl, getOrCreatePreset, type PacerConfig } from "../../protocol/types";
import { applyBoardEvent, createBoardState } from "../engine";
import { LED_COLOR_DEFAULT, getControlLedState, ledColor } from "../leds";
import type { BoardState } from "../types";

const S1 = ControlId.Stompswitch1;

function configWith(mode: ControlMode, msgType: number): PacerConfig {
  const config = createEmptyPacerConfig();
  const control = getOrCreateControl(getOrCreatePreset(config, FIRST_USER_PRESET_INDEX), S1);
  control.controlMode = mode;
  for (let n = 1; n <= 3; n++) {
    control.steps[n] = { channel: 0, msgType, data: [20 + n, 0, 127], active: true };
    control.led[n] = { activeColor: 2 * n + 1, inactiveColor: 2 * n + 2 };
  }
  return config;
}

function event(board: BoardState, phase: "press" | "release") {
  return applyBoardEvent(board, { controlId: S1, phase }).board;
}

describe("ledColor", () => {
  it("maps documented codes and flags 0x7F as the undocumented default", () => {
    expect(ledColor(0x03).name).toBe("2A Red");
    expect(ledColor(0x04).name).toBe("2B Dim Red");
    expect(ledColor(0x18).name).toBe("12B Dim White");
    expect(ledColor(LED_COLOR_DEFAULT).name).toMatch(/undocumented/);
    expect(ledColor(0x50).name).toMatch(/Unknown/);
  });
});

describe("getControlLedState", () => {
  it("is undefined for an unconfigured control", () => {
    expect(getControlLedState(createBoardState(createEmptyPacerConfig()), S1)).toBeUndefined();
  });

  it("shows step 1's inactive color at rest and active color while held", () => {
    let board = createBoardState(configWith(ControlMode.AllStepsAtOnce, SwitchMessageType.CcTrigger));
    expect(getControlLedState(board, S1)).toEqual({ stepNumber: 1, lit: false, colorCode: 4 });
    board = event(board, "press");
    expect(getControlLedState(board, S1)).toEqual({ stepNumber: 1, lit: true, colorCode: 3 });
    board = event(board, "release");
    expect(getControlLedState(board, S1)?.lit).toBe(false);
  });

  it("stays lit after release while a toggle step is on", () => {
    let board = createBoardState(configWith(ControlMode.AllStepsAtOnce, SwitchMessageType.CcToggle));
    board = event(event(board, "press"), "release");
    expect(getControlLedState(board, S1)).toMatchObject({ lit: true, colorCode: 3 });
    board = event(event(board, "press"), "release");
    expect(getControlLedState(board, S1)).toMatchObject({ lit: false, colorCode: 4 });
  });

  it("follows the most recently fired step in Sequence mode", () => {
    let board = createBoardState(configWith(ControlMode.Sequence, SwitchMessageType.CcTrigger));
    expect(getControlLedState(board, S1)?.stepNumber).toBe(1);
    board = event(board, "press");
    expect(getControlLedState(board, S1)).toEqual({ stepNumber: 1, lit: true, colorCode: 3 });
    board = event(event(event(board, "release"), "press"), "release");
    expect(getControlLedState(board, S1)).toEqual({ stepNumber: 2, lit: false, colorCode: 6 });
  });
});
