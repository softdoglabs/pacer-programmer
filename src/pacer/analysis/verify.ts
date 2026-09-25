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
  /** Key of the copy this one goes back to, for a state that returns. */
  returnsTo?: string;
}

/** Explains what wouldn't survive a round trip, or undefined when the machine is safe. */
export function whatWontSurvive(machine: StateMachine, config: PacerConfig, slots: CompiledSlot[]): string | undefined {
  const recovered = recoverMachine(config);
  const stateOfPreset = new Map(slots.map((s) => [s.presetIndex, s.stateId]));
  const authored = new Map(machine.states.map((s) => [s.id, s]));

  /** Which of the machine's states each recovered state came from, and which presets weren't its. */
  const origins = recovered.states.map((state) => {
    const members = recovered.members[state.id] ?? [];
    return {
      state,
      members,
      own: [...new Set(members.map((m) => stateOfPreset.get(m)))].filter((id): id is string => id !== undefined),
      intruders: members.filter((m) => !stateOfPreset.has(m)),
    };
  });

  /*
   * A preset the machine never touched that behaves exactly like one of its states comes back as
   * the same state — giving it a copy the machine never made and, if it returns, somewhere else to
   * come back from. Said first, because the symptoms it causes further down read as the design's
   * fault when they're the configuration's.
   */
  for (const { own, members, intruders } of origins) {
    if (own.length === 0 || intruders.length === 0) continue;
    const name = authored.get(own[0]!)?.name ?? own[0];
    const where = intruders.map(presetIndexToLabel).join(", ");
    return `${where} already ${intruders.length === 1 ? "behaves" : "behave"} like "${name}" apart from where ${intruders.length === 1 ? "it leads" : "they lead"}, so ${members.length} presets come back as one state. Give "${name}" something of its own to do, or clear ${intruders.length === 1 ? "that preset" : "those presets"}.`;
  }

  /*
   * Only what the machine owns is judged from here. A configuration usually has presets the machine
   * has no opinion about, and whatever those already say — an unreadable jump, a state that doesn't
   * come back — is the user's business, not a reason to refuse their design. Compiling from nothing
   * passes every preset here, so this narrows nothing in that case.
   */
  const ownNote = recovered.notes.find((n) => stateOfPreset.has(n.presetIndex));
  if (ownNote) return ownNote.message;

  const slotOfKey = new Map(slots.map((s) => [s.key, s.presetIndex]));
  const presetsOfState = new Map<string, Set<number>>();
  for (const slot of slots) {
    const set = presetsOfState.get(slot.stateId) ?? new Set<number>();
    set.add(slot.presetIndex);
    presetsOfState.set(slot.stateId, set);
  }

  const recoveredOf = new Map<string, (typeof recovered.states)[number]>();

  for (const { state, members, own } of origins) {
    if (own.length === 0) continue; // none of this state's presets are the machine's
    if (own.length !== 1) {
      const names = own.map((id) => authored.get(id)?.name ?? id).join(" and ");
      return `"${names}" behave the same apart from where they lead, so they come back as one state. Give one of them something of its own to do, or make them one state.`;
    }
    const stateId = own[0]!;
    const expected = presetsOfState.get(stateId);
    if (!expected || expected.size !== members.length) {
      return `The copies of "${authored.get(stateId)?.name ?? stateId}" don't come back together.`;
    }
    recoveredOf.set(stateId, state);
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
        /*
         * One difference is not a loss. A return from a state with a single copy comes back as a
         * jump to the one place that enters it — and with one origin those are the same machine:
         * recompiling the recovered model yields the very same presets. The two only part company
         * once a second origin exists, and then the return is expressible and recovers as one.
         *
         * What matters is that the recovered model *means* the same thing, not that it has the
         * same shape. Anything else here does change the machine.
         */
        const copies = slots.filter((s) => s.stateId === state.id);
        const equivalent =
          authoredTransition.to.kind === "return" &&
          match.to.kind === "state" &&
          copies.length === 1 &&
          recoveredOf.get(stateOfPreset.get(slotOfKey.get(copies[0]!.returnsTo ?? "") ?? -1) ?? "")?.id === match.to.id;
        if (!equivalent) {
          return `The route from "${state.name ?? state.id}" comes back as a ${match.to.kind === "return" ? "return" : "jump"} rather than a ${authoredTransition.to.kind === "return" ? "return" : "jump"}.`;
        }
        continue;
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
