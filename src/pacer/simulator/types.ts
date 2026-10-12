// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import type { PacerConfig } from "../protocol/types";
import type { MidiState } from "./midiState";

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

/**
 * "press"/"release" are a switch's edges; an expression pedal also reports "move", carrying how
 * far it's pushed. A press is toe-down (position 1) and a release heel-down (position 0), so a
 * pedal simulated as a button still behaves as before.
 */
export type ControlPhase = "press" | "release" | "move";

/** Per-control runtime state, scoped to the currently active preset (reset whenever it changes). */
export interface ControlRuntimeState {
  /** 1-based; the step that will fire on the NEXT press in Sequence mode. Wraps 6 -> 1. */
  sequencePointer: number;
  /** Sequence mode only: the step armed by the most recent press, awaiting its matching release. */
  pendingSequenceStep?: number;
  pressed: boolean;
  /** Keyed by step number (1-6): persistent current value for CcStep/ProgramStep steps. */
  stepCounters: Partial<Record<number, number>>;
}

export function createControlRuntimeState(): ControlRuntimeState {
  return {
    sequencePointer: 1,
    pressed: false,
    stepCounters: {},
  };
}

export interface BoardState {
  config: PacerConfig;
  activePresetIndex: number;
  /** Keyed by ControlId. Absent entry == control never pressed since the last preset change. */
  controls: Partial<Record<number, ControlRuntimeState>>;
  /**
   * The device's remembered MIDI values. They persist across preset changes (unlike `controls`)
   * and are cleared only by an explicit reset or a new session. See midiState.ts.
   */
  midi: MidiState;
  /**
   * Where each expression pedal is, 0 (heel down) to 1 (toe down), keyed by ControlId. A pedal's
   * position is physical: it doesn't reset when the preset changes, and nothing but moving it
   * changes it.
   */
  pedals: Partial<Record<number, number>>;
}

export interface BoardEvent {
  controlId: number;
  phase: ControlPhase;
  /** Expression pedals only: 0 (heel down) to 1 (toe down). Defaults to the phase's end of the range. */
  position?: number;
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
