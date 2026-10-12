// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { ControlMode } from "../protocol/constants";
import { DEFAULT_GLOBAL_CHANNEL, wireChannel } from "../protocol/globalSettings";
import type { SwitchControl } from "../protocol/types";
import { EMPTY_MIDI_STATE, recordMidi, type MidiState } from "./midiState";
import { fireExpressionStep, fireSwitchStep, type StepSubState } from "./stepEffects";
import type { ControlPhase, ControlRuntimeState, DeviceAction, OutgoingMidiMessage } from "./types";

export type ControlKind = "switch" | "expressionPedal";

export interface ControlEffect {
  messages: OutgoingMidiMessage[];
  deviceActions: DeviceAction[];
  warnings: string[];
  nextRuntimeState: ControlRuntimeState;
}

/** Device-level state a control's steps read when they fire. */
export interface DeviceContext {
  /** The config's global MIDI channel (1-16), for steps set to channel 0 ("Global"). */
  globalChannel: number;
  /** The device's remembered MIDI values (toggles follow them). */
  midi: MidiState;
}

export const DEFAULT_DEVICE_CONTEXT: DeviceContext = { globalChannel: DEFAULT_GLOBAL_CHANNEL, midi: EMPTY_MIDI_STATE };

interface FiredSteps {
  messages: OutgoingMidiMessage[];
  deviceActions: DeviceAction[];
  warnings: string[];
  stepCounters: Partial<Record<number, number>>;
}

function activeStepNumbers(control: SwitchControl): number[] {
  return Object.keys(control.steps)
    .map(Number)
    .filter((n) => control.steps[n]?.active)
    .sort((a, b) => a - b);
}

/**
 * The step a Sequence-mode control fires after `from`: the next active step, wrapping after the
 * last one. Confirmed on hardware (SEQ test preset, firmware 1.01.12): a switch with two active
 * steps wraps on the third press, and an inactive step in the middle is skipped entirely. A step
 * whose type is Off still takes its turn — it's active, it just sends nothing.
 */
function nextActiveStep(control: SwitchControl, from: number): number {
  const active = activeStepNumbers(control);
  if (active.length === 0) return from;
  return active.find((n) => n > from) ?? active[0]!;
}

function fireStepsForControl(
  control: SwitchControl,
  controlKind: ControlKind,
  phase: ControlPhase,
  stepNumbers: number[],
  runtimeState: ControlRuntimeState,
  device: DeviceContext,
  /** Expression pedals: how far it's pushed (see `fireExpressionStep`). */
  position?: number,
): FiredSteps {
  const messages: OutgoingMidiMessage[] = [];
  const deviceActions: DeviceAction[] = [];
  const warnings: string[] = [];
  const stepCounters = { ...runtimeState.stepCounters };
  // Steps fire in order within one press, so each sees the MIDI the earlier ones sent.
  let midi = device.midi;

  for (const n of stepNumbers) {
    const step = control.steps[n];
    if (!step) continue;
    const subState: StepSubState = { counter: stepCounters[n], midi };
    const channel = wireChannel(step.channel, device.globalChannel);
    const fired =
      controlKind === "switch"
        ? fireSwitchStep(step, phase, subState, channel ?? 0)
        : fireExpressionStep(step, phase, subState, channel ?? 0, position);
    if (channel === undefined && fired.messages.length > 0) {
      warnings.push(`step ${n}: channel byte ${step.channel} is out of range (expected 0 = Global or 1-16)`);
      fired.messages.length = 0;
    }
    messages.push(...fired.messages);
    deviceActions.push(...fired.deviceActions);
    warnings.push(...fired.warnings);
    midi = recordMidi(midi, fired.messages);
    if (fired.runtimePatch) stepCounters[n] = fired.runtimePatch.counter;
  }

  return { messages, deviceActions, warnings, stepCounters };
}

function pressControl(
  control: SwitchControl,
  controlKind: ControlKind,
  runtimeState: ControlRuntimeState,
  device: DeviceContext,
  position?: number,
): ControlEffect {
  const mode = control.controlMode ?? ControlMode.AllStepsAtOnce;

  let stepNumbers: number[];
  let nextSequencePointer = runtimeState.sequencePointer;
  let pendingSequenceStep = runtimeState.pendingSequenceStep;

  if (mode === ControlMode.Sequence) {
    const active = activeStepNumbers(control);
    // The pointer can sit on a step that has since been deactivated (edits, or a fresh control).
    const current = active.includes(runtimeState.sequencePointer) ? runtimeState.sequencePointer : (active[0] ?? 1);
    stepNumbers = [current];
    pendingSequenceStep = current;
    nextSequencePointer = nextActiveStep(control, current);
  } else if (mode === ControlMode.ExternalStepSelect) {
    // Deferred: cross-control step targeting isn't simulated yet (unverified target numbering) — always fires step 1.
    stepNumbers = [1];
  } else {
    stepNumbers = activeStepNumbers(control);
  }

  const fired = fireStepsForControl(control, controlKind, "press", stepNumbers, runtimeState, device, position);

  return {
    messages: fired.messages,
    deviceActions: fired.deviceActions,
    warnings: fired.warnings,
    nextRuntimeState: {
      sequencePointer: nextSequencePointer,
      pendingSequenceStep,
      pressed: true,
      stepCounters: fired.stepCounters,
    },
  };
}

function releaseControl(
  control: SwitchControl,
  controlKind: ControlKind,
  runtimeState: ControlRuntimeState,
  device: DeviceContext,
  position?: number,
): ControlEffect {
  const mode = control.controlMode ?? ControlMode.AllStepsAtOnce;

  let stepNumbers: number[];
  if (mode === ControlMode.Sequence) {
    stepNumbers = runtimeState.pendingSequenceStep !== undefined ? [runtimeState.pendingSequenceStep] : [];
  } else if (mode === ControlMode.ExternalStepSelect) {
    stepNumbers = [1];
  } else {
    stepNumbers = activeStepNumbers(control);
  }

  const fired = fireStepsForControl(control, controlKind, "release", stepNumbers, runtimeState, device, position);

  return {
    messages: fired.messages,
    deviceActions: fired.deviceActions,
    warnings: fired.warnings,
    nextRuntimeState: {
      sequencePointer: runtimeState.sequencePointer,
      pendingSequenceStep: undefined,
      pressed: false,
      stepCounters: fired.stepCounters,
    },
  };
}

/**
 * Resolves which step(s) fire for one press/release of a control, dispatching on its
 * ControlMode (AllStepsAtOnce/Sequence/ExternalStepSelect) — see the simulator plan.
 */
export function resolveControl(
  control: SwitchControl,
  controlKind: ControlKind,
  phase: ControlPhase,
  runtimeState: ControlRuntimeState,
  device: DeviceContext = DEFAULT_DEVICE_CONTEXT,
  /** Expression pedals: 0 (heel down) to 1 (toe down); see `BoardEvent`. */
  position?: number,
): ControlEffect {
  // A sweep fires the pedal's steps at its new position without changing whether it's "held".
  if (phase === "move") {
    const fired = fireStepsForControl(
      control,
      controlKind,
      "move",
      activeStepNumbers(control),
      runtimeState,
      device,
      position,
    );
    return {
      messages: fired.messages,
      deviceActions: fired.deviceActions,
      warnings: fired.warnings,
      nextRuntimeState: { ...runtimeState, stepCounters: fired.stepCounters },
    };
  }

  if (phase === "press") {
    if (runtimeState.pressed) {
      return { messages: [], deviceActions: [], warnings: ["control already held"], nextRuntimeState: runtimeState };
    }
    return pressControl(control, controlKind, runtimeState, device, position);
  }

  if (!runtimeState.pressed) {
    return {
      messages: [],
      deviceActions: [],
      warnings: ["release without matching press"],
      nextRuntimeState: runtimeState,
    };
  }
  return releaseControl(control, controlKind, runtimeState, device, position);
}
