// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { presetIndexToLabel } from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";
import { machineOf } from "./machineOf";
import type { RecoveredMachine } from "./recover";

/*
 * Whether an edit kept what the configuration means.
 *
 * Nothing but the dump is persisted, so a design survives only by being read back out of the
 * presets — whatever is authorable must be recoverable. Every edit that changes more than one
 * preset is checked here before it's written, and refused with the reason if it would lose
 * something, rather than being written and discovered on the next load.
 *
 * One check, asked two ways, because edits claim two different things:
 *
 * - **An edit** says "these steps changed, and these slots were written over". It's held to losing
 *   nothing else: no return that stops reading as a return, nothing unreadable that wasn't before.
 *   Returns are the thing to guard — nothing stores them; a copy returns because one preset leads to
 *   it and it leads back — so a route added in front of one, or taken away, quietly turns it into
 *   an ordinary jump, and nothing on the hardware would show it.
 * - **A renumbering** says "the design is exactly what it was; only where it sits changed". That's
 *   a stronger claim, so it's held to the stronger test: the whole machine, slots renamed, has to
 *   come back the same.
 */

/** One step of one preset. */
export interface StepRef {
  presetIndex: number;
  controlId: number;
  stepNumber: number;
}

export type Intended =
  /** Steps meant to change, and slots meant to be written over (whatever they did is gone on purpose). */
  | { kind: "edit"; steps: StepRef[]; taken?: readonly number[] }
  /** Presets moved from one slot to another; nothing else is meant to change. */
  | { kind: "renumbering"; moved: Readonly<Partial<Record<number, number>>> };

/** What an edit would lose, worded for the person making it — or undefined when it loses nothing. */
export function whatWasLost(before: PacerConfig, after: PacerConfig, intended: Intended): string | undefined {
  const was = machineOf(before);
  const is = machineOf(after);
  const moved = intended.kind === "renumbering" ? intended.moved : {};
  const slot = (index: number) => moved[index] ?? index;

  // No return stops being one, unless it was on a step the edit set out to change.
  const meant = new Set(intended.kind === "edit" ? intended.steps.map(key) : []);
  const taken = new Set(intended.kind === "edit" ? (intended.taken ?? []) : []);
  const has = returnsByPreset(is);
  for (const ref of returnsByPreset(was).values()) {
    if (meant.has(key(ref)) || taken.has(ref.presetIndex)) continue;
    if (!has.has(key({ ...ref, presetIndex: slot(ref.presetIndex) }))) {
      return `That would stop ${presetIndexToLabel(ref.presetIndex)} coming back to where it was entered from — it would become a plain jump instead.`;
    }
  }

  // Nothing unreadable that could be read before. The configuration around an edit may already have
  // problems of its own; those aren't the edit's doing. A renumbering is compared by count, since
  // the messages name slots and the slots are what it changed.
  if (intended.kind === "edit") {
    const known = new Set(was.notes.map((n) => n.message));
    const fresh = is.notes.find((n) => !known.has(n.message));
    if (fresh) return `That would leave something unreadable: ${fresh.message}`;
  } else if (is.notes.length > was.notes.length) {
    return `That would leave something unreadable: ${is.notes[0]!.message}`;
  }

  if (intended.kind === "renumbering") {
    // The slots filled were empty and the slots vacated are left empty, so neither is part of the
    // design on the side where it's empty.
    const filled = new Set(Object.values(moved).filter((n): n is number => n !== undefined));
    const vacated = new Set(Object.keys(moved).map(Number));
    if (shape(was, filled, slot) !== shape(is, vacated, (n) => n)) {
      const what = Object.entries(moved)
        .map(([from, to]) => `${presetIndexToLabel(Number(from))} to ${presetIndexToLabel(to!)}`)
        .join(", ");
      return `Moving ${what} would change what the configuration does, not just where it sits.`;
    }
  }
  return undefined;
}

const key = (ref: StepRef) => `${ref.presetIndex}:${ref.controlId}:${ref.stepNumber}`;

/**
 * Every switch that depends on the way in, one entry per preset that carries it — which survives
 * states merging or gaining a copy. Returns and tables alike: either is a way back nothing stores.
 */
function returnsByPreset(machine: RecoveredMachine): Map<string, StepRef> {
  const found = new Map<string, StepRef>();
  for (const state of machine.states) {
    for (const t of state.transitions) {
      if (t.to.kind === "state") continue;
      for (const presetIndex of machine.members[state.id] ?? []) {
        const ref = { presetIndex, controlId: t.controlId, stepNumber: t.stepNumber };
        found.set(key(ref), ref);
      }
    }
  }
  return found;
}

/**
 * A machine as something comparable: each state by the presets it is and where each of its routes
 * leads, slots passed through `slot`, with `leaveOut` dropped. Names are left out (they're labels;
 * a state's identity is what it does), and so is plain stepping: next/previous names a direction,
 * not a preset, so the neighbors of a moved preset step somewhere new and that's what stepping means.
 */
function shape(machine: RecoveredMachine, leaveOut: ReadonlySet<number>, slot: (n: number) => number): string {
  const presetsOf = (id: string) =>
    (machine.members[id] ?? [])
      .filter((m) => !leaveOut.has(m))
      .map(slot)
      .sort((a, b) => a - b);
  const states = machine.states
    .map((state) => ({
      members: presetsOf(state.id),
      routes: state.transitions
        .filter((t) => !t.viaStepping)
        .map((t) => ({
          c: t.controlId,
          n: t.stepNumber,
          to:
            t.to.kind === "return"
              ? "return"
              : t.to.kind === "state"
                ? presetsOf(t.to.id)
                : t.to.routes
                    .map((r) => ({ from: presetsOf(r.from), to: r.to.kind === "return" ? "back" : presetsOf(r.to.id) }))
                    .sort((a, b) => (a.from[0] ?? 0) - (b.from[0] ?? 0)),
        }))
        .sort((a, b) => a.c - b.c || a.n - b.n),
    }))
    .filter((s) => s.members.length > 0);
  return JSON.stringify(states.sort((a, b) => a.members[0]! - b.members[0]!));
}
