import { ControlMode, EXPRESSION_PEDAL_CONTROL_IDS, PRESET_COUNT, SWITCH_CONTROL_IDS } from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";
import { resolveControl, type ControlKind } from "./controlEffects";
import {
  createControlRuntimeState,
  type BoardEffect,
  type BoardEvent,
  type BoardState,
  type DeviceAction,
  type SpecialPresetName,
} from "./types";

export function createBoardState(config: PacerConfig, initialPresetIndex = 0): BoardState {
  return { config, activePresetIndex: initialPresetIndex, controls: {} };
}

export function controlKindOf(controlId: number): ControlKind | undefined {
  if (SWITCH_CONTROL_IDS.includes(controlId)) return "switch";
  if (EXPRESSION_PEDAL_CONTROL_IDS.includes(controlId)) return "expressionPedal";
  return undefined;
}

function wrapPresetIndex(index: number): number {
  return ((index % PRESET_COUNT) + PRESET_COUNT) % PRESET_COUNT;
}

/** Resolves at most one preset-navigation action into a concrete target index. Extra ones warn and are ignored. */
function resolvePresetNavigation(
  activePresetIndex: number,
  deviceActions: DeviceAction[],
): { nextPresetIndex?: number; specialPreset?: SpecialPresetName; warning?: string } {
  const navActions = deviceActions.filter(
    (a) => a.kind === "presetJump" || a.kind === "presetRelative" || a.kind === "specialPreset",
  );
  if (navActions.length === 0) return {};

  const warning =
    navActions.length > 1 ? "multiple preset-navigation actions fired by one press; using the first" : undefined;

  const action = navActions[0]!;
  if (action.kind === "specialPreset") {
    return { specialPreset: action.preset, warning };
  }
  if (action.kind === "presetJump") {
    return { nextPresetIndex: action.targetIndex, warning };
  }
  const delta = action.direction === "next" ? 1 : -1;
  return { nextPresetIndex: wrapPresetIndex(activePresetIndex + delta), warning };
}

export function applyBoardEvent(board: BoardState, event: BoardEvent): { board: BoardState; effect: BoardEffect } {
  const controlKind = controlKindOf(event.controlId);
  if (!controlKind) {
    return {
      board,
      effect: { messages: [], relayActions: [], warnings: [`0x${event.controlId.toString(16)} is not a switch or expression pedal control id`] },
    };
  }

  const preset = board.config.presets[board.activePresetIndex];
  const control = preset?.controls[event.controlId];
  if (!control) {
    return {
      board,
      effect: { messages: [], relayActions: [], warnings: [`control 0x${event.controlId.toString(16)} is not configured on the active preset`] },
    };
  }

  const runtimeState = board.controls[event.controlId] ?? createControlRuntimeState();
  const resolved = resolveControl(control, controlKind, event.phase, runtimeState);

  const {
    nextPresetIndex,
    specialPreset,
    warning: navWarning,
  } = resolvePresetNavigation(board.activePresetIndex, resolved.deviceActions);
  const warnings = navWarning ? [...resolved.warnings, navWarning] : resolved.warnings;
  const relayActions = resolved.deviceActions.filter((a): a is Extract<DeviceAction, { kind: "relay" }> => a.kind === "relay");

  if (specialPreset) {
    // Leaving for a firmware DAW preset: the board (and its runtime state) stays exactly as it
    // was, since that's the preset the firmware comes back to. The pressed control's own state
    // change is discarded, like any other preset-changing press.
    return { board, effect: { messages: resolved.messages, relayActions, specialPresetRequested: specialPreset, warnings } };
  }

  if (nextPresetIndex !== undefined && nextPresetIndex !== board.activePresetIndex) {
    // Preset change resets ALL controls' runtime state (assumption, see the simulator plan) —
    // this also means the just-computed `resolved.nextRuntimeState` for the pressed control is
    // discarded, so a release that follows (still addressed to this controlId) lands on nothing.
    return {
      board: { config: board.config, activePresetIndex: nextPresetIndex, controls: {} },
      effect: {
        messages: resolved.messages,
        relayActions,
        presetChanged: { from: board.activePresetIndex, to: nextPresetIndex },
        warnings,
      },
    };
  }

  return {
    board: {
      config: board.config,
      activePresetIndex: board.activePresetIndex,
      controls: { ...board.controls, [event.controlId]: resolved.nextRuntimeState },
    },
    effect: { messages: resolved.messages, relayActions, warnings },
  };
}

/** Controls actually defined on the active preset, in a stable display order. Recomputed fresh every call. */
export function getActiveControlIds(board: BoardState): number[] {
  const preset = board.config.presets[board.activePresetIndex];
  if (!preset) return [];
  return [...SWITCH_CONTROL_IDS, ...EXPRESSION_PEDAL_CONTROL_IDS].filter((id) => preset.controls[id] !== undefined);
}

export interface ControlDisplayState {
  controlId: number;
  exists: boolean;
  pressed: boolean;
  activeToggleSteps: number[];
  /** Only set when the control's mode is Sequence. */
  sequencePointer?: number;
}

export function getControlDisplayState(board: BoardState, controlId: number): ControlDisplayState {
  const preset = board.config.presets[board.activePresetIndex];
  const control = preset?.controls[controlId];
  if (!control) {
    return { controlId, exists: false, pressed: false, activeToggleSteps: [] };
  }

  const runtime = board.controls[controlId];
  const activeToggleSteps = runtime
    ? Object.entries(runtime.toggleState)
        .filter(([, isOn]) => isOn)
        .map(([stepNumber]) => Number(stepNumber))
    : [];

  return {
    controlId,
    exists: true,
    pressed: runtime?.pressed ?? false,
    activeToggleSteps,
    sequencePointer: control.controlMode === ControlMode.Sequence ? runtime?.sequencePointer ?? 1 : undefined,
  };
}
