import {
  FIRST_USER_PRESET_INDEX,
  PRESET_NAME_LENGTH,
  LAST_USER_PRESET_INDEX,
  SwitchMessageType,
  presetIndexToLabel,
  presetIndexToPresetSelectTarget,
} from "../pacer/protocol/constants";
import { createEmptyPacerConfig, getOrCreateControl, getOrCreatePreset } from "../pacer/protocol/types";
import type { PacerConfig, Step } from "../pacer/protocol/types";
import { recoverMachine, type MachineTransition, type StateMachine } from "../pacer/analysis";

/*
 * Test support: builds the presets a designed machine needs, from nothing.
 *
 * This was the app's compiler once. The editor never used it — it changes machines by editing the
 * presets that are already there (see `pacer/authoring`), which works the same on a dump from the
 * device as on an empty one — so it lives with the tests, where it does two jobs:
 *
 * - **Fixtures.** Describing a looper and its origins as states is far easier to read than placing
 *   steps preset by preset, and it's how most of the multi-preset tests set up their configuration.
 * - **The property test.** `analysis/__tests__/roundTrip.test.ts` compiles designs and checks the
 *   recovery reads back the design that was meant — whatever is authorable must be recoverable.
 *
 * It refuses rather than half-compiling: a design over budget, a returning state nothing enters, a
 * body containing a navigation step, or one that wouldn't read back (`whatWontSurvive`).
 *
 * A state that never returns needs one copy however many places enter it: its behaviour doesn't
 * depend on where you came from. A state that returns needs one copy per distinct continuation,
 * and a state entered *from* such a copy multiplies in turn — which is how a design that reads as
 * three states can cost more slots than the device has.
 */

/** One compiled copy of a state: the state, plus the instance it goes back to. */
interface Instance {
  stateId: string;
  /** Key of the instance a `return` leads to, or undefined for a state that never returns. */
  returnTo?: string;
}

const instanceKey = (i: Instance): string => `${i.stateId}<${i.returnTo ?? ""}`;

export type CompileResult =
  | { ok: true; config: PacerConfig; slots: { key: string; stateId: string; presetIndex: number }[] }
  | { ok: false; error: string; needed?: number };

const SLOTS = LAST_USER_PRESET_INDEX - FIRST_USER_PRESET_INDEX + 1;

function returns(state: StateMachine["states"][number]): boolean {
  return state.transitions.some((t) => t.to.kind === "return");
}

function navigates(step: Step | undefined): boolean {
  return (
    step !== undefined &&
    (step.msgType === SwitchMessageType.PresetSelect || step.msgType === SwitchMessageType.PresetIncDec)
  );
}

/** Expands a machine into the presets the hardware needs, or says why it can't. */
export function compileMachine(machine: StateMachine): CompileResult {
  const byId = new Map(machine.states.map((s) => [s.id, s]));
  /*
   * Names need only fit the display. They are labels, not identities: what makes two states the
   * same is behaving alike apart from where their navigation leads, which is what the recovery
   * groups on, so two states may share a name as long as they do something different.
   */
  for (const state of machine.states) {
    const name = state.name?.trim();
    if (name !== undefined && name.length > PRESET_NAME_LENGTH) {
      return { ok: false, error: `"${name}" is longer than the ${PRESET_NAME_LENGTH} characters a preset name holds.` };
    }
  }
  for (const state of machine.states) {
    for (const control of Object.values(state.body)) {
      for (const step of Object.values(control?.steps ?? {})) {
        if (navigates(step)) {
          return { ok: false, error: `State "${state.id}" has a navigation step in its body; use a transition.` };
        }
      }
    }
    for (const t of state.transitions) {
      if (t.to.kind === "state" && !byId.has(t.to.id)) {
        return { ok: false, error: `State "${state.id}" leads to "${t.to.id}", which doesn't exist.` };
      }
    }
  }

  // Seeds: states that never return don't need a continuation, so they exist once and are where
  // a design begins. A state that returns is only ever reached by being entered.
  const instances = new Map<string, Instance>();
  const queue: Instance[] = [];
  const add = (instance: Instance): string => {
    const key = instanceKey(instance);
    if (!instances.has(key)) {
      instances.set(key, instance);
      queue.push(instance);
    }
    return key;
  };
  for (const state of machine.states) if (!returns(state)) add({ stateId: state.id });

  // Where each instance's transitions lead, once the continuations are known.
  const resolved = new Map<string, { transition: MachineTransition; targetKey: string }[]>();
  while (queue.length > 0) {
    const instance = queue.shift()!;
    const key = instanceKey(instance);
    const state = byId.get(instance.stateId)!;
    const edges: { transition: MachineTransition; targetKey: string }[] = [];
    for (const transition of state.transitions) {
      if (transition.to.kind === "return") {
        if (instance.returnTo === undefined) {
          return { ok: false, error: `State "${state.id}" returns, but nothing enters it.` };
        }
        edges.push({ transition, targetKey: instance.returnTo });
        continue;
      }
      const target = byId.get(transition.to.id)!;
      // Only a returning state carries a continuation; giving one to a state that never returns
      // would duplicate it for nothing.
      edges.push({ transition, targetKey: add({ stateId: target.id, returnTo: returns(target) ? key : undefined }) });
    }
    resolved.set(key, edges);
    if (instances.size > SLOTS) {
      return { ok: false, error: `This design needs more than the Pacer's ${SLOTS} presets.`, needed: instances.size };
    }
  }

  if (instances.size === 0) return { ok: false, error: "A machine needs at least one state that doesn't return." };

  // Deterministic slots, so compiling the same machine twice puts everything in the same place.
  const keys = [...instances.keys()];
  const slotOf = new Map(keys.map((key, i) => [key, FIRST_USER_PRESET_INDEX + i]));

  const config = createEmptyPacerConfig();
  for (const key of keys) {
    const instance = instances.get(key)!;
    const state = byId.get(instance.stateId)!;
    const preset = getOrCreatePreset(config, slotOf.get(key)!);
    if (state.name !== undefined) preset.name = state.name;
    for (const [controlId, control] of Object.entries(state.body)) {
      if (!control) continue;
      const copy = getOrCreateControl(preset, Number(controlId));
      copy.controlMode = control.controlMode;
      for (const [n, step] of Object.entries(control.steps)) if (step) copy.steps[Number(n)] = { ...step };
      for (const [n, led] of Object.entries(control.led)) if (led) copy.led[Number(n)] = { ...led };
    }
    for (const { transition, targetKey } of resolved.get(key) ?? []) {
      getOrCreateControl(preset, transition.controlId).steps[transition.stepNumber] = {
        channel: 0,
        msgType: SwitchMessageType.PresetSelect,
        data: [presetIndexToPresetSelectTarget(slotOf.get(targetKey)!), 0, 0],
        active: true,
      };
    }
  }

  const compiledSlots = keys.map((key) => ({
    key,
    stateId: instances.get(key)!.stateId,
    presetIndex: slotOf.get(key)!,
    returnsTo: instances.get(key)!.returnTo,
  }));

  /*
   * The invariant, checked rather than assumed: read the machine back out of the presets just
   * written and refuse if it isn't the same one. Hand-derived rules about what survives are
   * guesses; this is the property itself.
   */
  const lost = whatWontSurvive(machine, config, compiledSlots);
  if (lost) return { ok: false, error: lost };

  return { ok: true, config, slots: compiledSlots };
}

/*
 * The invariant, as something that runs: the compiler recovers its own output and checks that it
 * got the same machine back. With one copy, a return comes back as a jump to the one place that
 * enters it — and with one origin those are the same machine — so that restatement is allowed.
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
