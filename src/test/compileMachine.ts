// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

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
import {
  dependsOnEntry,
  recoverMachine,
  routeFrom,
  type MachineTransition,
  type StateMachine,
} from "../pacer/analysis";

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
 * A state that never returns needs one copy however many places enter it: its behavior doesn't
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
  /** `slots` has a row per way into each state; ways in that lead to the same places share a preset. */
  | { ok: true; config: PacerConfig; slots: { key: string; stateId: string; presetIndex: number }[] }
  | { ok: false; error: string; needed?: number };

const SLOTS = LAST_USER_PRESET_INDEX - FIRST_USER_PRESET_INDEX + 1;

/** A state whose switches depend on the way in needs a copy per context; any other exists once. */
const returns = (state: StateMachine["states"][number]): boolean => dependsOnEntry(state);

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
      const ids =
        t.to.kind === "state"
          ? [t.to.id]
          : t.to.kind === "byEntry"
            ? t.to.routes.flatMap((r) => (r.to.kind === "state" ? [r.to.id] : []))
            : [];
      const missing = ids.find((id) => !byId.has(id));
      if (missing) return { ok: false, error: `State "${state.id}" leads to "${missing}", which doesn't exist.` };
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
      // Where this switch leads from this copy's way in: a fixed state, or a row of its table.
      let to = transition.to.kind === "byEntry" ? undefined : transition.to;
      if (transition.to.kind !== "state") {
        if (instance.returnTo === undefined) {
          return { ok: false, error: `State "${state.id}" depends on the way in, but nothing enters it.` };
        }
        const from = instances.get(instance.returnTo)!.stateId;
        to = routeFrom(transition.to, from);
        if (!to)
          return { ok: false, error: `State "${state.id}" doesn't say where it leads when entered from "${from}".` };
      }
      if (to!.kind === "return") {
        edges.push({ transition, targetKey: instance.returnTo! });
        continue;
      }
      const target = byId.get(to!.id)!;
      // Only a returning state carries a continuation; giving one to a state that never returns
      // would duplicate it for nothing.
      edges.push({ transition, targetKey: add({ stateId: target.id, returnTo: returns(target) ? key : undefined }) });
    }
    resolved.set(key, edges);
    // Far past anything that could fit, and before a design that multiplies without end runs away.
    if (instances.size > SLOTS * SLOTS) {
      return { ok: false, error: `This design needs more than the Pacer's ${SLOTS} presets.`, needed: instances.size };
    }
  }

  if (instances.size === 0) return { ok: false, error: "A machine needs at least one state that doesn't return." };

  /*
   * Copies that behave the same are one preset, as they are when the app builds them (`realize`):
   * a looper that goes back to MAIN0 when entered from there, and always to MAIN0 when entered
   * from MAIN2, leads to the same places either way, so those two ways in share a copy. Found by
   * refinement: start with every copy of a state together, and split wherever two lead to copies
   * that have themselves been split, until nothing more comes apart.
   */
  let classOf = new Map([...instances].map(([key, i]) => [key, i.stateId]));
  for (let count = 0; ;) {
    const next = new Map(
      [...instances].map(([key, i]) => [
        key,
        `${i.stateId}|${(resolved.get(key) ?? []).map((e) => classOf.get(e.targetKey)).join("|")}`,
      ]),
    );
    const classes = new Set(next.values()).size;
    classOf = next;
    if (classes === count) break;
    count = classes;
  }

  // Deterministic slots, so compiling the same machine twice puts everything in the same place.
  const keys = [...instances.keys()];
  const slotOfClass = new Map<string, number>();
  for (const key of keys) {
    const cls = classOf.get(key)!;
    if (!slotOfClass.has(cls)) slotOfClass.set(cls, FIRST_USER_PRESET_INDEX + slotOfClass.size);
  }
  const slotOf = new Map(keys.map((key) => [key, slotOfClass.get(classOf.get(key)!)!]));

  if (slotOfClass.size > SLOTS) {
    return { ok: false, error: `This design needs more than the Pacer's ${SLOTS} presets.`, needed: slotOfClass.size };
  }

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

  /*
   * What each authored transition means once compiled: where it leads from each way in that
   * actually exists. A table row for a state that never enters this one has nothing to compile to,
   * so it isn't part of the meaning. Normalized the way the recovery reads: every way in going back
   * is a return, every way in going to one state is a jump — and a state of one copy can only ever
   * be a jump, since one preset has one destination.
   */
  const contextsOf = (stateId: string) =>
    [
      ...new Set(
        slots
          .filter((s) => s.stateId === stateId && s.returnsTo)
          .map((s) => slots.find((x) => x.key === s.returnsTo)!.stateId),
      ),
    ].sort();
  const meaning = (stateId: string, t: MachineTransition): string => {
    if (t.to.kind === "state") return `->${recoveredOf.get(t.to.id)?.id ?? "?"}`;
    const copies = [...new Set(slots.filter((s) => s.stateId === stateId).map((s) => s.presetIndex))];
    const rows = contextsOf(stateId).map((from) => {
      const to = routeFrom(t.to, from);
      return {
        from: recoveredOf.get(from)?.id ?? "?",
        to: to?.kind === "state" ? (recoveredOf.get(to.id)?.id ?? "?") : "back",
      };
    });
    if (copies.length === 1 && rows.length === 1) return `->${rows[0]!.to === "back" ? rows[0]!.from : rows[0]!.to}`;
    if (rows.every((r) => r.to === "back")) return "return";
    const fixed = new Set(rows.map((r) => r.to));
    if (fixed.size === 1 && !fixed.has("back")) return `->${[...fixed][0]}`;
    return `by ${rows.map((r) => `${r.from}:${r.to}`).join(",")}`;
  };
  const recoveredMeaning = (t: MachineTransition): string => {
    if (t.to.kind === "state") return `->${t.to.id}`;
    if (t.to.kind === "return") return "return";
    return `by ${[...t.to.routes]
      .sort((a, b) => a.from.localeCompare(b.from))
      .map((r) => `${r.from}:${r.to.kind === "state" ? r.to.id : "back"}`)
      .join(",")}`;
  };

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
      const meant = meaning(state.id, authoredTransition);
      const read = recoveredMeaning(match);
      if (meant !== read) {
        return `The route from "${state.name ?? state.id}" comes back meaning ${read} rather than ${meant}.`;
      }
    }
  }
  return undefined;
}
