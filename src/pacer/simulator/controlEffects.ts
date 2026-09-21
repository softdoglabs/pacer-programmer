import { ControlMode, STEPS_PER_CONTROL } from "../protocol/constants";
import { DEFAULT_GLOBAL_CHANNEL, wireChannel } from "../protocol/globalSettings";
import type { SwitchControl } from "../protocol/types";
import { fireExpressionStep, fireSwitchStep, type StepSubState } from "./stepEffects";
import type { ControlPhase, ControlRuntimeState, DeviceAction, OutgoingMidiMessage } from "./types";

export type ControlKind = "switch" | "expressionPedal";

export interface ControlEffect {
  messages: OutgoingMidiMessage[];
  deviceActions: DeviceAction[];
  warnings: string[];
  nextRuntimeState: ControlRuntimeState;
}

interface FiredSteps {
  messages: OutgoingMidiMessage[];
  deviceActions: DeviceAction[];
  warnings: string[];
  toggleState: Partial<Record<number, boolean>>;
  stepCounters: Partial<Record<number, number>>;
}

function activeStepNumbers(control: SwitchControl): number[] {
  return Object.keys(control.steps)
    .map(Number)
    .filter((n) => control.steps[n]?.active);
}

function fireStepsForControl(
  control: SwitchControl,
  controlKind: ControlKind,
  phase: ControlPhase,
  stepNumbers: number[],
  runtimeState: ControlRuntimeState,
  globalChannel: number,
): FiredSteps {
  const messages: OutgoingMidiMessage[] = [];
  const deviceActions: DeviceAction[] = [];
  const warnings: string[] = [];
  const toggleState = { ...runtimeState.toggleState };
  const stepCounters = { ...runtimeState.stepCounters };

  for (const n of stepNumbers) {
    const step = control.steps[n];
    if (!step) continue;
    const subState: StepSubState = { toggle: toggleState[n], counter: stepCounters[n] };
    const channel = wireChannel(step.channel, globalChannel);
    const fire = controlKind === "switch" ? fireSwitchStep : fireExpressionStep;
    const fired = fire(step, phase, subState, channel ?? 0);
    if (channel === undefined && fired.messages.length > 0) {
      warnings.push(`step ${n}: channel byte ${step.channel} is out of range (expected 0 = Global or 1-16)`);
      fired.messages.length = 0;
    }
    messages.push(...fired.messages);
    deviceActions.push(...fired.deviceActions);
    warnings.push(...fired.warnings);
    if (fired.runtimePatch?.toggle !== undefined) toggleState[n] = fired.runtimePatch.toggle;
    if (fired.runtimePatch?.counter !== undefined) stepCounters[n] = fired.runtimePatch.counter;
  }

  return { messages, deviceActions, warnings, toggleState, stepCounters };
}

function pressControl(
  control: SwitchControl,
  controlKind: ControlKind,
  runtimeState: ControlRuntimeState,
  globalChannel: number,
): ControlEffect {
  const mode = control.controlMode ?? ControlMode.AllStepsAtOnce;

  let stepNumbers: number[];
  let nextSequencePointer = runtimeState.sequencePointer;
  let pendingSequenceStep = runtimeState.pendingSequenceStep;

  if (mode === ControlMode.Sequence) {
    stepNumbers = [runtimeState.sequencePointer];
    pendingSequenceStep = runtimeState.sequencePointer;
    nextSequencePointer = runtimeState.sequencePointer >= STEPS_PER_CONTROL ? 1 : runtimeState.sequencePointer + 1;
  } else if (mode === ControlMode.ExternalStepSelect) {
    // Deferred: cross-control step targeting isn't simulated yet (unverified target numbering) — always fires step 1.
    stepNumbers = [1];
  } else {
    stepNumbers = activeStepNumbers(control);
  }

  const fired = fireStepsForControl(control, controlKind, "press", stepNumbers, runtimeState, globalChannel);

  return {
    messages: fired.messages,
    deviceActions: fired.deviceActions,
    warnings: fired.warnings,
    nextRuntimeState: {
      sequencePointer: nextSequencePointer,
      pendingSequenceStep,
      pressed: true,
      toggleState: fired.toggleState,
      stepCounters: fired.stepCounters,
    },
  };
}

function releaseControl(
  control: SwitchControl,
  controlKind: ControlKind,
  runtimeState: ControlRuntimeState,
  globalChannel: number,
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

  const fired = fireStepsForControl(control, controlKind, "release", stepNumbers, runtimeState, globalChannel);

  return {
    messages: fired.messages,
    deviceActions: fired.deviceActions,
    warnings: fired.warnings,
    nextRuntimeState: {
      sequencePointer: runtimeState.sequencePointer,
      pendingSequenceStep: undefined,
      pressed: false,
      toggleState: fired.toggleState,
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
  /** The config's global MIDI channel (1-16), for steps set to channel 0 ("Global"). */
  globalChannel: number = DEFAULT_GLOBAL_CHANNEL,
): ControlEffect {
  if (phase === "press") {
    if (runtimeState.pressed) {
      return { messages: [], deviceActions: [], warnings: ["control already held"], nextRuntimeState: runtimeState };
    }
    return pressControl(control, controlKind, runtimeState, globalChannel);
  }

  if (!runtimeState.pressed) {
    return {
      messages: [],
      deviceActions: [],
      warnings: ["release without matching press"],
      nextRuntimeState: runtimeState,
    };
  }
  return releaseControl(control, controlKind, runtimeState, globalChannel);
}
