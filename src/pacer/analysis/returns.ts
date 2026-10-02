import { CURRENT_PRESET_INDEX } from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";
import type { RecoveredMachine } from "./recover";
import { isPlainStepping, presetTransitions, type TransitionGraph } from "./transitions";

/*
 * What enters a preset, and what it means for a state to come back.
 *
 * These are the rules a state machine is read by, and they used to be written out wherever they
 * were needed — recovery had one copy, authoring another — so a fix to one didn't reach the other.
 * Two of the bugs found on the owner's device were exactly that: the Current slot counted as a way
 * in, and so did plain stepping, in one copy of the rule but not the other. They live here once.
 */

/** One switch on a state: where a route or a way back is carried. */
export interface SwitchStep {
  controlId: number;
  stepNumber: number;
}

/**
 * The presets that lead to `presetIndex` by name — what could have entered it.
 *
 * - **Plain stepping doesn't count.** Next/previous names a direction, not a preset. Every slot has
 *   neighbours, and C and D step on almost every preset on a real device, so counting it would make
 *   everything look entered from two places and no return could ever be recognised.
 * - **Neither does the Current slot**, for the same reason it isn't a state: it's the device's
 *   working copy of whichever preset is loaded, so its switches are a second copy of that preset's.
 *   Every real dump has one, and counting it gave everything the loaded preset leads to a phantom
 *   second way in.
 * - Nor does a preset leading to itself.
 */
export function presetEntrants(
  config: PacerConfig,
  presetIndex: number,
  graph: TransitionGraph = presetTransitions(config),
): number[] {
  return [
    ...new Set(
      (graph.into[presetIndex] ?? [])
        .filter((e) => e.from !== presetIndex && e.from !== CURRENT_PRESET_INDEX && !isPlainStepping(config, e))
        .map((e) => e.from),
    ),
  ];
}

/** The one preset that enters `presetIndex`, if exactly one does — somewhere a return can go back to. */
export function soleEntrant(
  config: PacerConfig,
  presetIndex: number,
  graph: TransitionGraph = presetTransitions(config),
): number | undefined {
  const entrants = presetEntrants(config, presetIndex, graph);
  return entrants.length === 1 ? entrants[0] : undefined;
}

/**
 * Whether one switch, across all the copies of a state, is its way back: each copy leading to the
 * one preset that entered it. `targets[i]` is where the switch leads on `members[i]`.
 *
 * With one copy this is never true, deliberately. "Goes back to whatever entered it" and "goes to
 * A1" are then the same preset, and nothing in the dump says which was meant — so it reads as the
 * jump it literally is — the same machine, as long as there's only one way in. A second way in is
 * what settles it.
 */
export function readsAsReturn(
  config: PacerConfig,
  members: readonly number[],
  targets: readonly (number | undefined)[],
  graph: TransitionGraph = presetTransitions(config),
): boolean {
  return members.length > 1 && members.every((m, i) => targets[i] === soleEntrant(config, m, graph));
}

/**
 * The switches that carry a state's way back — or, for a state of one preset, would.
 *
 * Two readings, one for each side of the question above:
 * - **With copies it's settled**: the switches the recovery read as returns (`readsAsReturn`).
 * - **With one copy it's an open question**, and this answers "if it does come back, by which
 *   switch?": the ones leading to a preset that enters it. That's what lets a second way in offer
 *   to make it a return (`authoring`'s `RoutePlan.choice`) without the recovery claiming to know.
 */
export function wayBack(config: PacerConfig, machine: RecoveredMachine, stateId: string): SwitchStep[] {
  const state = machine.states.find((s) => s.id === stateId);
  const members = machine.members[stateId] ?? [];
  if (!state || members.length === 0) return [];
  if (members.length > 1) {
    return state.transitions
      .filter((t) => t.to.kind === "return")
      .map((t) => ({ controlId: t.controlId, stepNumber: t.stepNumber }));
  }
  const entrants = presetEntrants(config, members[0]!);
  return state.transitions
    .filter((t) => t.to.kind === "state" && (machine.members[t.to.id] ?? []).some((m) => entrants.includes(m)))
    .map((t) => ({ controlId: t.controlId, stepNumber: t.stepNumber }));
}
