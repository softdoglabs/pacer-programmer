import {
  ControlMode,
  STEPS_PER_CONTROL,
  SWITCH_CONTROL_IDS,
  SwitchMessageType,
  presetSelectTargetToIndex,
  wrapUserPresetIndex,
} from "../protocol/constants";
import type { PacerConfig, Step, SwitchControl } from "../protocol/types";

/*
 * Where each preset can lead. The Pacer can't save state, so users compile it into the preset
 * graph: a switch sends MIDI *and* jumps somewhere, and that preset's switches lead on. Recovering
 * that graph from a flat dump is the point of this project (see CLAUDE.md, Purpose #3).
 *
 * Only a control step can change preset. A preset's load-time MIDI can't — its message table has
 * no preset type at all — and neither can an expression pedal, whose types are all continuous.
 * The firmware's own routes ([Preset] held, Track/Transport) aren't edges either: they're
 * available from everywhere and belong to the device, not to a configuration.
 */

/** Where an edge leads. Not every target is a user preset. */
export type TransitionTarget =
  | { kind: "preset"; index: number }
  /** Preset Select's target 0: reload the preset that's already loaded. */
  | { kind: "reload" }
  /** Preset Select's targets 1 and 2: the firmware's own DAW presets, which aren't in the config. */
  | { kind: "special"; preset: "track" | "transport" };

/**
 * What a press has to do to reach the step. In All-at-once mode a press fires every active step,
 * so a navigating step is reached immediately. In Sequence mode each press advances one active
 * step, so the same control leads somewhere different depending on how many times it's been
 * pressed — which is itself a piece of state a user has compiled into the preset.
 */
export type TransitionTrigger =
  | { kind: "press" }
  | { kind: "sequencePosition"; position: number }
  /** Another control chooses the step, and cross-control targeting isn't modeled (see CLAUDE.md). */
  | { kind: "externalStep" };

export interface TransitionEdge {
  /** Preset index the press happens on. */
  from: number;
  controlId: number;
  stepNumber: number;
  target: TransitionTarget;
  trigger: TransitionTrigger;
  /**
   * Steps that fire on the same press and send something — what makes the jump meaningful, as in
   * "activate the looper *and* go to the looper-active preset". Empty in Sequence mode, where a
   * press fires one step and nothing accompanies it.
   */
  alsoFires: { stepNumber: number; step: Step }[];
}

export interface TransitionGraph {
  edges: TransitionEdge[];
  /** Edges leaving each preset, keyed by preset index. */
  from: Partial<Record<number, TransitionEdge[]>>;
  /** Edges arriving at each preset, keyed by preset index. Relative and reload edges resolve first. */
  into: Partial<Record<number, TransitionEdge[]>>;
}

function activeSteps(control: SwitchControl): { stepNumber: number; step: Step }[] {
  const found: { stepNumber: number; step: Step }[] = [];
  for (let n = 1; n <= STEPS_PER_CONTROL; n++) {
    const step = control.steps[n];
    if (step?.active) found.push({ stepNumber: n, step });
  }
  return found;
}

/** Where a navigating step leads from `from`, or undefined if the step doesn't navigate. */
function targetOf(step: Step, from: number): TransitionTarget | undefined {
  if (step.msgType === SwitchMessageType.PresetSelect) {
    const target = step.data[0];
    if (target === 0) return { kind: "reload" };
    if (target === 1) return { kind: "special", preset: "track" };
    if (target === 2) return { kind: "special", preset: "transport" };
    const index = presetSelectTargetToIndex(target);
    return index === undefined ? undefined : { kind: "preset", index };
  }
  if (step.msgType === SwitchMessageType.PresetIncDec) {
    // Relative, so it only has a target once you know where you are. data[0]: 0 = next, 1 = previous.
    const delta = step.data[0] === 0 ? 1 : -1;
    return { kind: "preset", index: wrapUserPresetIndex(from + delta) };
  }
  return undefined;
}

function sends(step: Step): boolean {
  return step.msgType !== SwitchMessageType.Off && targetOf(step, 0) === undefined;
}

function edgesForControl(from: number, controlId: number, control: SwitchControl): TransitionEdge[] {
  const steps = activeSteps(control);
  const mode = control.controlMode ?? ControlMode.AllStepsAtOnce;

  if (mode === ControlMode.Sequence) {
    // Each press fires the next active step, so every navigating step is its own edge, reached
    // after that many presses. Nothing accompanies it: one press, one step.
    return steps.flatMap(({ stepNumber, step }, i) => {
      const target = targetOf(step, from);
      return target
        ? [
            {
              from,
              controlId,
              stepNumber,
              target,
              trigger: { kind: "sequencePosition" as const, position: i + 1 },
              alsoFires: [],
            },
          ]
        : [];
    });
  }

  const trigger: TransitionTrigger =
    mode === ControlMode.ExternalStepSelect ? { kind: "externalStep" } : { kind: "press" };

  if (mode === ControlMode.ExternalStepSelect) {
    // Which step fires is another control's business, so every navigating step is possible.
    return steps.flatMap(({ stepNumber, step }) => {
      const target = targetOf(step, from);
      return target ? [{ from, controlId, stepNumber, target, trigger, alsoFires: [] }] : [];
    });
  }

  /*
   * All at once: the press fires every active step, but the engine takes only the first
   * navigation action and warns about the rest (see simulator/engine.ts), so the graph shows the
   * one edge that actually happens. Everything else the press sends travels with it.
   */
  const navigating = steps.find(({ step }) => targetOf(step, from) !== undefined);
  if (!navigating) return [];
  const target = targetOf(navigating.step, from);
  if (!target) return [];
  return [
    {
      from,
      controlId,
      stepNumber: navigating.stepNumber,
      target,
      trigger,
      alsoFires: steps.filter((s) => s.stepNumber !== navigating.stepNumber && sends(s.step)),
    },
  ];
}

/**
 * Plain stepping: relative next/previous carrying nothing else. It names a direction rather than a
 * preset, so it says nothing about which state a press was meant to reach — it's the neighbour walk
 * most presets carry on C and D, and it's worth telling apart from a designed route.
 */
export function isPlainStepping(config: PacerConfig, edge: TransitionEdge): boolean {
  const step = config.presets[edge.from]?.controls[edge.controlId]?.steps[edge.stepNumber];
  return step?.msgType === SwitchMessageType.PresetIncDec && edge.alsoFires.length === 0;
}

/** Every preset-to-preset route a configuration's own controls can take. */
export function presetTransitions(config: PacerConfig): TransitionGraph {
  const edges: TransitionEdge[] = [];
  for (const preset of Object.values(config.presets)) {
    if (!preset) continue;
    for (const controlId of SWITCH_CONTROL_IDS) {
      const control = preset.controls[controlId];
      if (control) edges.push(...edgesForControl(preset.index, controlId, control));
    }
  }

  const from: TransitionGraph["from"] = {};
  const into: TransitionGraph["into"] = {};
  for (const edge of edges) {
    (from[edge.from] ??= []).push(edge);
    const arrivesAt =
      edge.target.kind === "preset" ? edge.target.index : edge.target.kind === "reload" ? edge.from : undefined;
    if (arrivesAt !== undefined) (into[arrivesAt] ??= []).push(edge);
  }
  return { edges, from, into };
}
