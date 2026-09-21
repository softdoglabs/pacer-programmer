import type { PacerConfig } from "../protocol/types";

/** Real outgoing MIDI wire messages. Deliberately excludes preset navigation and relay actions — see `DeviceAction`. */
export type OutgoingMidiMessage =
  | { kind: "noteOn"; channel: number; note: number; velocity: number }
  | { kind: "noteOff"; channel: number; note: number; velocity: number }
  | { kind: "controlChange"; channel: number; controller: number; value: number }
  | { kind: "programChange"; channel: number; program: number }
  | { kind: "pitchBend"; channel: number; value14: number }
  | { kind: "channelAftertouch"; channel: number; value: number }
  | { kind: "mmc"; deviceId: number; command: number };

/**
 * Device-local effects that are NOT MIDI wire messages: preset navigation
 * (confirmed: nothing is sent on the wire for this) and relay actions.
 * Kept out of `OutgoingMidiMessage` so the type system enforces the
 * distinction rather than relying on convention.
 */
/**
 * The firmware's built-in, read-only DAW presets (Nektar DAW Integration), reachable via
 * PresetSelect's reserved targets 1 ("track") and 2 ("transport"). They aren't in the
 * config at all; see `src/pacer/device/specialPresets.ts`.
 */
export type SpecialPresetName = "track" | "transport";

export type DeviceAction =
  | { kind: "presetJump"; targetIndex: number }
  | { kind: "specialPreset"; preset: SpecialPresetName }
  | { kind: "presetRelative"; direction: "next" | "prev" }
  | { kind: "relay"; relayIndex: number; mode: number };

export type ControlPhase = "press" | "release";

/** Per-control runtime state, scoped to the currently active preset (reset whenever it changes). */
export interface ControlRuntimeState {
  /** 1-based; the step that will fire on the NEXT press in Sequence mode. Wraps 6 -> 1. */
  sequencePointer: number;
  /** Sequence mode only: the step armed by the most recent press, awaiting its matching release. */
  pendingSequenceStep?: number;
  pressed: boolean;
  /** Keyed by step number (1-6): persistent toggle bit for CcToggle/NoteToggle steps. */
  toggleState: Partial<Record<number, boolean>>;
  /** Keyed by step number (1-6): persistent current value for CcStep/ProgramStep steps. */
  stepCounters: Partial<Record<number, number>>;
}

export function createControlRuntimeState(): ControlRuntimeState {
  return {
    sequencePointer: 1,
    pressed: false,
    toggleState: {},
    stepCounters: {},
  };
}

export interface BoardState {
  config: PacerConfig;
  activePresetIndex: number;
  /** Keyed by ControlId. Absent entry == control never pressed since the last preset change. */
  controls: Partial<Record<number, ControlRuntimeState>>;
}

export interface BoardEvent {
  controlId: number;
  phase: ControlPhase;
}

export interface BoardEffect {
  messages: OutgoingMidiMessage[];
  relayActions: Extract<DeviceAction, { kind: "relay" }>[];
  presetChanged?: { from: number; to: number };
  /**
   * The press asked the firmware to enter a built-in DAW preset. The board itself is left on
   * the current user preset: that's the "last preset" the firmware returns to afterwards.
   */
  specialPresetRequested?: SpecialPresetName;
  warnings: string[];
}
