import {
  ControlMode,
  EXPRESSION_PEDAL_CONTROL_IDS,
  FIRST_USER_PRESET_INDEX,
  SWITCH_CONTROL_IDS,
  wrapUserPresetIndex,
} from "../protocol/constants";
import { globalMidiChannel, wireChannel } from "../protocol/globalSettings";
import { EMPTY_MIDI_STATE, recordMidi, stepValueOn, type MidiState } from "./midiState";
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

export function createBoardState(
  config: PacerConfig,
  initialPresetIndex = FIRST_USER_PRESET_INDEX,
  midi: MidiState = EMPTY_MIDI_STATE,
): BoardState {
  return { config, activePresetIndex: initialPresetIndex, controls: {}, midi };
}

/**
 * Switches to another preset (or reloads this one). Per-control runtime state starts fresh (an
 * assumption: step counters and sequence positions reset), but the device's remembered MIDI
 * values carry over (observed).
 */
export function changePreset(board: BoardState, index: number): BoardState {
  return createBoardState(board.config, index, board.midi);
}

/** Forgets every remembered MIDI value (the simulator's "Reset MIDI state"). */
export function resetMidiState(board: BoardState): BoardState {
  return { ...board, midi: EMPTY_MIDI_STATE };
}

export function controlKindOf(controlId: number): ControlKind | undefined {
  if (SWITCH_CONTROL_IDS.includes(controlId)) return "switch";
  if (EXPRESSION_PEDAL_CONTROL_IDS.includes(controlId)) return "expressionPedal";
  return undefined;
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
  return { nextPresetIndex: wrapUserPresetIndex(activePresetIndex + delta), warning };
}

export function applyBoardEvent(board: BoardState, event: BoardEvent): { board: BoardState; effect: BoardEffect } {
  const controlKind = controlKindOf(event.controlId);
  if (!controlKind) {
    return {
      board,
      effect: {
        messages: [],
        relayActions: [],
        warnings: [`0x${event.controlId.toString(16)} is not a switch or expression pedal control id`],
      },
    };
  }

  const preset = board.config.presets[board.activePresetIndex];
  const control = preset?.controls[event.controlId];
  if (!control) {
    return {
      board,
      effect: {
        messages: [],
        relayActions: [],
        warnings: [`control 0x${event.controlId.toString(16)} is not configured on the active preset`],
      },
    };
  }

  const runtimeState = board.controls[event.controlId] ?? createControlRuntimeState();
  const resolved = resolveControl(
    control,
    controlKind,
    event.phase,
    runtimeState,
    { globalChannel: globalMidiChannel(board.config), midi: board.midi },
    event.position,
  );
  const midi = recordMidi(board.midi, resolved.messages);

  const {
    nextPresetIndex,
    specialPreset,
    warning: navWarning,
  } = resolvePresetNavigation(board.activePresetIndex, resolved.deviceActions);
  const warnings = navWarning ? [...resolved.warnings, navWarning] : resolved.warnings;
  const relayActions = resolved.deviceActions.filter(
    (a): a is Extract<DeviceAction, { kind: "relay" }> => a.kind === "relay",
  );

  if (specialPreset) {
    // Leaving for a firmware DAW preset: the board (and its runtime state) stays exactly as it
    // was, since that's the preset the firmware comes back to. The pressed control's own state
    // change is discarded, like any other preset-changing press.
    return {
      board: { ...board, midi },
      effect: { messages: resolved.messages, relayActions, specialPresetRequested: specialPreset, warnings },
    };
  }

  if (nextPresetIndex !== undefined && nextPresetIndex !== board.activePresetIndex) {
    // Preset change resets ALL controls' runtime state (assumption, see the simulator plan) —
    // this also means the just-computed `resolved.nextRuntimeState` for the pressed control is
    // discarded, so a release that follows (still addressed to this controlId) lands on nothing.
    return {
      board: createBoardState(board.config, nextPresetIndex, midi),
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
      ...board,
      controls: { ...board.controls, [event.controlId]: resolved.nextRuntimeState },
      midi,
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
  /** Steps whose MIDI is currently in its On state per the remembered values (e.g. a CC Toggle that's on). */
  valueOnSteps: number[];
  /** Only set when the control's mode is Sequence. */
  sequencePointer?: number;
}

export function getControlDisplayState(board: BoardState, controlId: number): ControlDisplayState {
  const preset = board.config.presets[board.activePresetIndex];
  const control = preset?.controls[controlId];
  if (!control) {
    return { controlId, exists: false, pressed: false, valueOnSteps: [] };
  }

  const runtime = board.controls[controlId];
  const globalChannel = globalMidiChannel(board.config);
  const valueOnSteps = Object.entries(control.steps)
    .filter(([, step]) => {
      if (!step?.active) return false;
      const channel = wireChannel(step.channel, globalChannel);
      return channel !== undefined && stepValueOn(step, channel, board.midi) === true;
    })
    .map(([n]) => Number(n));

  return {
    controlId,
    exists: true,
    pressed: runtime?.pressed ?? false,
    valueOnSteps,
    sequencePointer: control.controlMode === ControlMode.Sequence ? (runtime?.sequencePointer ?? 1) : undefined,
  };
}
