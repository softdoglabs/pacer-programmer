import type { PacerConfig } from "../protocol/types";
import { presetIndexToLabel } from "../protocol/constants";
import type { StateMachine } from "./machine";
import { recoverMachine } from "./recover";

/*
 * The invariant, as something that runs: whatever can be authored must be recoverable.
 *
 * Nothing but the dump is persisted, so a machine survives only by being read back out of the
 * presets it compiled to. Rather than police that with rules derived by hand — every one of which
 * is a guess about what might not survive — the compiler recovers its own output and checks that
 * it got the same machine back. Anything that doesn't round trip is refused at the point of
 * compiling, with the reason, instead of being discovered on the next load.
 *
 * It is cheap: the recovery is a pass over at most 24 presets.
 */

export interface CompiledSlot {
  key: string;
  stateId: string;
  presetIndex: number;
}

/** Explains what wouldn't survive a round trip, or undefined when the machine is safe. */
export function whatWontSurvive(machine: StateMachine, config: PacerConfig, slots: CompiledSlot[]): string | undefined {
  const recovered = recoverMachine(config);
  if (recovered.notes.length > 0) return recovered.notes[0]!.message;

  const stateOfPreset = new Map(slots.map((s) => [s.presetIndex, s.stateId]));
  const presetsOfState = new Map<string, Set<number>>();
  for (const slot of slots) {
    const set = presetsOfState.get(slot.stateId) ?? new Set<number>();
    set.add(slot.presetIndex);
    presetsOfState.set(slot.stateId, set);
  }

  const authored = new Map(machine.states.map((s) => [s.id, s]));
  const recoveredOf = new Map<string, (typeof recovered.states)[number]>();

  for (const state of recovered.states) {
    const members = recovered.members[state.id] ?? [];
    const sources = new Set(members.map((m) => stateOfPreset.get(m)));
    if (sources.size !== 1) {
      const names = [...sources].map((id) => authored.get(id ?? "")?.name ?? id).join(" and ");
      return `"${names}" behave the same apart from where they lead, so they come back as one state. Give one of them something of its own to do, or make them one state.`;
    }
    const [stateId] = sources;
    const expected = presetsOfState.get(stateId ?? "");
    if (!expected || expected.size !== members.length) {
      return `The copies of "${authored.get(stateId ?? "")?.name ?? stateId}" don't come back together.`;
    }
    recoveredOf.set(stateId!, state);
  }

  for (const state of machine.states) {
    const back = recoveredOf.get(state.id);
    if (!back) return `"${state.name ?? state.id}" isn't in the presets it compiled to.`;
    if (back.transitions.length !== state.transitions.length) {
      return `"${state.name ?? state.id}" has ${state.transitions.length} route(s) but ${back.transitions.length} come back.`;
    }
    for (const authoredTransition of state.transitions) {
      const match = back.transitions.find(
        (t) => t.controlId === authoredTransition.controlId && t.stepNumber === authoredTransition.stepNumber,
      );
      if (!match) {
        return `A route from "${state.name ?? state.id}" doesn't come back on the switch it was put on.`;
      }
      if (match.to.kind !== authoredTransition.to.kind) {
        // The one that can't be told apart: a return from a state with a single copy looks
        // exactly like a jump to the place that entered it, because with one origin it is one.
        return `The route from "${state.name ?? state.id}" comes back as a ${match.to.kind === "return" ? "return" : "jump"} rather than a ${authoredTransition.to.kind === "return" ? "return" : "jump"}. A return from a state entered in only one place can't be told from a jump there.`;
      }
      if (authoredTransition.to.kind === "state" && match.to.kind === "state") {
        const target = recoveredOf.get(authoredTransition.to.id);
        if (!target || target.id !== match.to.id) {
          const where = (recovered.members[match.to.id] ?? []).map(presetIndexToLabel).join(", ");
          return `A route from "${state.name ?? state.id}" comes back pointing at ${where || match.to.id}.`;
        }
      }
    }
  }
  return undefined;
}
