import { SPECIAL_PRESETS, type DeviceMode } from "../device";
import { PACER_HARDWARE, type PhysicalSwitchId, type SwitchSpec } from "../hardware";
import type { BoardState } from "../simulator/types";
import { displayState } from "./display";
import { dawPresetLights, presetButtonBar, presetSelectLights } from "./firmwareLights";
import { idleLights, type SwitchLights } from "./lights";
import type { PanelState, SwitchPanelState } from "./types";
import { userPresetLights } from "./userPresetLights";

/** The firmware-mode inputs to the panel (mirrors the device mode machine's state). */
export interface FirmwareModeState {
  mode: DeviceMode;
  pendingBank: number;
  presetButtonDown: boolean;
}

function modeLights(spec: SwitchSpec, board: BoardState, firmware: FirmwareModeState): SwitchLights {
  if (spec.kind === "presetSwitch") return { bottom: presetButtonBar(firmware.mode) };
  switch (firmware.mode) {
    case "user": {
      if (spec.controlId === undefined) return {};
      const control = board.config.presets[board.activePresetIndex]?.controls[spec.controlId];
      return userPresetLights(
        spec,
        control,
        board.controls[spec.controlId],
        board.lastProgramChangeControlId === spec.controlId,
      );
    }
    case "presetSelect":
      return presetSelectLights(spec, firmware.pendingBank, board.activePresetIndex);
    case "track":
    case "transport":
      return dawPresetLights(spec, SPECIAL_PRESETS[firmware.mode]);
  }
}

function switchState(spec: SwitchSpec, board: BoardState, firmware: FirmwareModeState): SwitchPanelState {
  const pressed =
    spec.kind === "presetSwitch"
      ? firmware.presetButtonDown
      : firmware.mode === "user" && spec.controlId !== undefined && (board.controls[spec.controlId]?.pressed ?? false);
  // Mode-driven lights take precedence over idle ones, indicator by indicator.
  return { pressed, lights: { ...idleLights(spec), ...modeLights(spec, board, firmware) } };
}

/** Everything the Pacer's panel shows right now: every switch's lights, and the display. */
export function computePanelState(board: BoardState, firmware: FirmwareModeState): PanelState {
  const switches = Object.fromEntries(
    (PACER_HARDWARE as readonly SwitchSpec[]).map((spec) => [spec.id, switchState(spec, board, firmware)]),
  ) as Record<PhysicalSwitchId, SwitchPanelState>;
  return {
    switches,
    display: displayState(board.config, board.activePresetIndex, firmware.mode, firmware.pendingBank),
  };
}
