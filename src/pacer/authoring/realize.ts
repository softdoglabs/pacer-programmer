// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import {
  FIRST_USER_PRESET_INDEX,
  LAST_USER_PRESET_INDEX,
  SwitchMessageType,
  isUserPresetIndex,
  presetIndexToLabel,
  presetSelectTargetToIndex,
} from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";
import {
  dependsOnEntry,
  machineOf,
  routeFrom,
  type MachineState,
  type MachineTransition,
  type RecoveredMachine,
  type StateMachine,
} from "../analysis";
import { clearPreset, copyPreset, isSparePreset, setJump } from "../editing";
import { switchSpecForControl } from "../hardware";

/*
 * Turning a machine into presets, in a configuration that already has them.
 *
 * Every route edit is a change to the machine — this switch on this state now leads there, or back,
 * or somewhere that depends on the way in — followed by this: work out which presets that machine
 * needs, and make the configuration have them.
 *
 * - **Copies.** A state whose switches don't depend on the way in is one preset. One that does
 *   needs a preset per context, a context being the copy that entered it, so a state entered from
 *   inside another state's copies multiplies in turn (nested returns). Contexts that would lead to
 *   exactly the same places share one preset (a partial return), worked out the way a DFA is
 *   minimised: start from one class per state and split until every copy in a class leads to the
 *   same classes.
 * - **Keeping what's there.** Each copy is matched to an existing preset of its state that the
 *   same context already enters, so an edit rewrites as little as it can. Copies with nothing to
 *   match take the slots the caller chose (`into`); presets a touched state no longer needs are
 *   freed (cleared, and named EMPTY so they read as spare).
 * - **Checked.** The result is read back, and refused with the reason unless every state means
 *   what the machine says. Nothing but the dump is persisted, so this is the only guarantee there
 *   is that an edit didn't quietly change the design.
 */

/** A copy the machine needs that has no preset yet. */
export interface CopyNeed {
  stateId: string;
  /** The state whose copy enters this one, so a picker can say "LOOPR, entered from MAIN3". */
  enteredFrom?: string;
}

export type Realization =
  | { ok: true; config: PacerConfig; added: number[]; freed: number[] }
  /** `needs` is set when the only problem is slots: say which presets the new copies may take. */
  | { ok: false; error: string; needs?: CopyNeed[]; freed?: number[] };

const SLOTS = LAST_USER_PRESET_INDEX - FIRST_USER_PRESET_INDEX + 1;

interface Instance {
  key: string;
  stateId: string;
  /** Key of the instance that entered this one, for a state that depends on the way in. */
  context?: string;
  /** A state that depends on the way in but that nothing enters: kept as it is. */
  idle?: boolean;
}

const slotKey = (t: { controlId: number; stepNumber: number }) => `${t.controlId}:${t.stepNumber}`;

/**
 * Makes `config` hold `after`, starting from `before` (what it holds now).
 *
 * `affected` names the states an edit is allowed to add or free presets for. Everything else is
 * expected to come out as it went in: a configuration often has presets the edit has no business
 * with, unused copies included, and tidying those up behind the user's back would be its own
 * surprise.
 */
export function realize(
  config: PacerConfig,
  before: RecoveredMachine,
  after: StateMachine,
  into: readonly number[],
  affected: ReadonlySet<string>,
): Realization {
  const byId = new Map(after.states.map((s) => [s.id, s]));
  /*
   * Spare presets (cleared, nothing active but stepping) all behave alike, so they read as one
   * state. It isn't one anybody designed, and its presets are exactly where new copies go — so it
   * holds on to none of them, and isn't checked afterwards.
   */
  const spare = (id: string) => {
    const presets = before.members[id] ?? [];
    return presets.length > 0 && presets.every((m) => isSparePreset(config.presets[m]));
  };
  const depends = (id: string) => {
    const s = byId.get(id);
    return s !== undefined && dependsOnEntry(s);
  };

  // --- Instances: one per state, or per context for a state that depends on the way in.
  const instances = new Map<string, Instance>();
  const queue: Instance[] = [];
  const add = (stateId: string, context?: string): string => {
    const key = context === undefined ? stateId : `${stateId}<${context}`;
    if (!instances.has(key)) {
      const instance = { key, stateId, ...(context !== undefined ? { context } : {}) };
      instances.set(key, instance);
      queue.push(instance);
    }
    return key;
  };
  for (const state of after.states) if (!depends(state.id)) add(state.id);

  /** Where each instance's switches lead: an instance key, or undefined to leave the step as it is. */
  const targets = new Map<string, Map<string, string | undefined>>();
  const resolve = (instance: Instance): string | undefined => {
    const state = byId.get(instance.stateId)!;
    const leads = new Map<string, string | undefined>();
    for (const t of state.transitions) {
      if (t.viaStepping) continue;
      let to = t.to.kind === "state" ? t.to : undefined;
      if (t.to.kind !== "state") {
        if (instance.context === undefined) {
          leads.set(slotKey(t), undefined); // an idle copy: nothing to go back to, so leave it
          continue;
        }
        const from = instances.get(instance.context)!.stateId;
        const row = routeFrom(t.to, from);
        if (!row) {
          return `"${name(state)}" doesn't say where its ${switchName(t)} leads when entered from "${name(byId.get(from))}".`;
        }
        if (row.kind === "return") {
          leads.set(slotKey(t), instance.context);
          continue;
        }
        to = row;
      }
      if (!byId.has(to!.id)) return `"${name(state)}" leads to a state that isn't there.`;
      leads.set(slotKey(t), add(to!.id, depends(to!.id) ? instance.key : undefined));
    }
    targets.set(instance.key, leads);
    return undefined;
  };
  while (queue.length > 0) {
    const problem = resolve(queue.shift()!);
    if (problem) return { ok: false, error: problem };
    if (instances.size > SLOTS * 4)
      return { ok: false, error: `That would need more than the Pacer's ${SLOTS} presets.` };
  }
  // A state that depends on the way in but that nothing enters keeps one preset, untouched: the
  // map still shows it, and the next route into it has somewhere to land.
  for (const state of after.states) {
    if (depends(state.id) && ![...instances.values()].some((i) => i.stateId === state.id)) {
      const key = `${state.id}<idle`;
      instances.set(key, { key, stateId: state.id, idle: true });
      targets.set(key, new Map(state.transitions.filter((t) => !t.viaStepping).map((t) => [slotKey(t), undefined])));
    }
  }

  // --- Classes: instances that lead to the same places share a preset.
  const keys = [...instances.keys()];
  let classOf = new Map(keys.map((k) => [k, instances.get(k)!.stateId + (instances.get(k)!.idle ? "<idle" : "")]));
  for (;;) {
    const signature = (k: string) =>
      `${classOf.get(k)}|${[...targets.get(k)!.entries()].map(([s, to]) => `${s}>${to === undefined ? "-" : classOf.get(to)}`).join(",")}`;
    const ids = new Map<string, string>();
    const next = new Map(keys.map((k) => [k, ids.get(signature(k)) ?? (ids.set(signature(k), k), k)]));
    const count = (m: Map<string, string>) => new Set(m.values()).size;
    if (count(next) === count(classOf)) break;
    classOf = next;
  }
  const classes = new Map<string, string[]>();
  for (const k of keys) classes.set(classOf.get(k)!, [...(classes.get(classOf.get(k)!) ?? []), k]);

  // --- Presets: match each class to one that's already there, in the order the copies arise, so a
  // copy's context has its preset by the time the copy is matched.
  const presetOf = new Map<string, number>();
  const used = new Set<number>();
  const needs: { classKey: string; need: CopyNeed }[] = [];
  const order = [...new Set(keys.map((k) => classOf.get(k)!))];
  for (const classKey of order) {
    const members = classes.get(classKey)!;
    const stateId = instances.get(members[0]!)!.stateId;
    const existing = (before.members[stateId] ?? []).filter((m) => !used.has(m));
    let preset: number | undefined;
    if (!depends(stateId) || instances.get(members[0]!)!.idle) {
      preset = existing[0];
    } else {
      // The preset the same context already enters, if there is one.
      const contexts = members
        .map((k) => instances.get(k)!.context)
        .filter((c): c is string => c !== undefined)
        .map((c) => presetOf.get(classOf.get(c)!))
        .filter((p): p is number => p !== undefined);
      preset = existing.find((m) => (before.waysIn[m] ?? []).some((w) => contexts.includes(w)));
      if (preset === undefined && !affected.has(stateId)) preset = existing[0];
    }
    if (preset === undefined) {
      const context = instances.get(members[0]!)!.context;
      needs.push({
        classKey,
        need: { stateId, ...(context !== undefined ? { enteredFrom: instances.get(context)!.stateId } : {}) },
      });
      continue;
    }
    presetOf.set(classKey, preset);
    if (!spare(stateId)) used.add(preset);
  }

  // Presets an affected state no longer needs. Only states that are (or were) more than one preset
  // because of the way in: a state that's simply on the device twice is the user's business.
  const freed = [...affected].flatMap((id) => {
    const wasCopies = before.states.find((s) => s.id === id);
    if (!depends(id) && !(wasCopies && dependsOnEntry(wasCopies))) return [];
    return (before.members[id] ?? []).filter((m) => !used.has(m));
  });

  if (needs.length > into.length) {
    return {
      ok: false,
      error: `That needs ${needs.length} more preset${needs.length === 1 ? "" : "s"}. Say which.`,
      needs: needs.map((n) => n.need),
      freed,
    };
  }
  for (const slot of into.slice(0, needs.length)) {
    if (!isUserPresetIndex(slot)) return { ok: false, error: `${slot} isn't one of the Pacer's 24 presets.` };
    if (used.has(slot)) {
      return {
        ok: false,
        error: `${presetIndexToLabel(slot)} is one of the presets this machine uses, so a copy can't take it.`,
      };
    }
    if (!isSparePreset(config.presets[slot]) && !freed.includes(slot)) {
      return {
        ok: false,
        error: `${presetIndexToLabel(slot)} has something in it. Clear it first, or pick an empty one.`,
      };
    }
  }
  if (new Set(into).size !== into.length) return { ok: false, error: "Two copies can't go in the same preset." };

  // --- Write: new copies first (as their state's template), then every jump that isn't already right.
  let edited = config;
  const added: number[] = [];
  needs.forEach(({ classKey }, i) => {
    const stateId = instances.get(classes.get(classKey)![0]!)!.stateId;
    const template = (before.members[stateId] ?? [])[0];
    const slot = into[i]!;
    if (template !== undefined) edited = copyPreset(edited, template, slot);
    presetOf.set(classKey, slot);
    added.push(slot);
  });
  for (const slot of freed) edited = clearPreset(edited, slot);

  for (const [classKey, members] of classes) {
    const preset = presetOf.get(classKey);
    if (preset === undefined) continue;
    for (const [slot, to] of targets.get(members[0]!)!) {
      if (to === undefined) continue;
      const target = presetOf.get(classOf.get(to)!);
      if (target === undefined) continue;
      const [controlId, stepNumber] = slot.split(":").map(Number) as [number, number];
      const step = edited.presets[preset]?.controls[controlId]?.steps[stepNumber];
      const already =
        step?.active &&
        step.msgType === SwitchMessageType.PresetSelect &&
        presetSelectTargetToIndex(step.data[0]) === target;
      if (!already) edited = setJump(edited, preset, controlId, stepNumber, target);
    }
  }

  // --- Check: read it back.
  const skip = new Set(after.states.filter((st) => spare(st.id)).map((st) => st.id));
  const problem = whatChanged(edited, after, classes, instances, presetOf, before, skip);
  if (problem) return { ok: false, error: problem };
  return { ok: true, config: edited, added, freed };
}

/**
 * Whether the configuration now means what `after` says, or what it got wrong. Compared by meaning:
 * where each switch leads from each way in that exists, normalised the way the recovery reads it.
 */
function whatChanged(
  config: PacerConfig,
  after: StateMachine,
  classes: Map<string, string[]>,
  instances: Map<string, Instance>,
  presetOf: Map<string, number>,
  before: RecoveredMachine,
  /** States not to judge: the spare presets, which new copies are allowed to take. */
  skip: ReadonlySet<string>,
): string | undefined {
  const read = machineOf(config);
  const byId = new Map(after.states.map((s) => [s.id, s]));
  const presetsOf = new Map<string, number[]>();
  for (const [classKey, members] of classes) {
    const stateId = instances.get(members[0]!)!.stateId;
    const preset = presetOf.get(classKey);
    if (preset !== undefined) presetsOf.set(stateId, [...(presetsOf.get(stateId) ?? []), preset]);
  }
  const readOf = (stateId: string) => {
    const presets = presetsOf.get(stateId) ?? [];
    const found = read.states.filter((s) => (read.members[s.id] ?? []).some((m) => presets.includes(m)));
    return found.length === 1 ? found[0] : undefined;
  };

  // Which recovered state each machine state became, and that its copies came back together, alone.
  for (const state of after.states) {
    const presets = presetsOf.get(state.id) ?? [];
    if (presets.length === 0 || skip.has(state.id)) continue;
    const r = readOf(state.id);
    if (!r) return `The copies of "${name(state)}" don't come back as one state.`;
    const foreign = (read.members[r.id] ?? []).filter(
      (m) => !presets.includes(m) && !(before.members[state.id] ?? []).includes(m),
    );
    if (foreign.length > 0) {
      const where = foreign.map(presetIndexToLabel).join(", ");
      return `${where} already ${foreign.length === 1 ? "behaves" : "behave"} like "${name(state)}" apart from where ${foreign.length === 1 ? "it leads" : "they lead"}, so ${foreign.length === 1 ? "it" : "they"} would come back as part of it. Give "${name(state)}" something of its own to do, or clear ${foreign.length === 1 ? "that preset" : "those presets"}.`;
    }
  }

  const readName = (id: string | undefined) => {
    const found = after.states.find((s) => readOf(s.id)?.id === id);
    return found?.id ?? `?${id}`;
  };
  for (const state of after.states) {
    if (skip.has(state.id)) continue;
    const r = readOf(state.id);
    if (!r) continue;
    const contexts = [
      ...new Set(
        [...instances.values()]
          .filter((i) => i.stateId === state.id && i.context !== undefined)
          .map((i) => instances.get(i.context!)!.stateId),
      ),
    ].sort();
    const copies = presetsOf.get(state.id)?.length ?? 0;
    for (const t of state.transitions) {
      if (t.viaStepping) continue;
      const got = r.transitions.find((x) => x.controlId === t.controlId && x.stepNumber === t.stepNumber);
      const meant = meaning(t, contexts, copies, byId);
      const was = got ? readMeaning(got, readName) : "nothing";
      if (meant !== undefined && meant !== was) {
        return `${name(state)}'s ${switchName(t)} would come back meaning ${describe(was)} rather than ${describe(meant)}.`;
      }
    }
    // A switch the machine doesn't have shouldn't lead anywhere on the device either.
    for (const got of r.transitions) {
      if (got.viaStepping) continue;
      if (!state.transitions.some((t) => t.controlId === got.controlId && t.stepNumber === got.stepNumber)) {
        return `${name(state)}'s ${switchName(got)} would still lead somewhere afterwards.`;
      }
    }
  }

  const presetsOfAll = [...presetsOf.entries()].filter(([id]) => !skip.has(id)).flatMap(([, p]) => p);
  const notes = read.notes.filter((n) => presetsOfAll.includes(n.presetIndex));
  const old = new Set(before.notes.map((n) => n.message));
  const fresh = notes.find((n) => !old.has(n.message));
  if (fresh) return `That would leave something unreadable: ${fresh.message}`;
  return undefined;
}

/** What a machine transition means once realized, given the states that actually enter. */
function meaning(
  t: MachineTransition,
  contexts: string[],
  copies: number,
  byId: Map<string, MachineState>,
): string | undefined {
  if (t.to.kind === "state") return `->${t.to.id}`;
  if (contexts.length === 0) return undefined; // nothing enters: kept as it was
  const rows = contexts.map((from) => {
    const to = routeFrom(t.to, from);
    return { from, to: to?.kind === "state" ? to.id : "back" };
  });
  // One preset has one destination: the recovery reads it as the jump it is. A jump to a state of
  // several copies is only distinguishable as "back" — which is what one copy can't be.
  if (copies === 1 && rows.every((r) => r.to === rows[0]!.to)) {
    return `->${rows[0]!.to === "back" ? rows[0]!.from : rows[0]!.to}`;
  }
  if (rows.every((r) => r.to === "back")) return "return";
  const fixed = new Set(rows.map((r) => r.to));
  if (
    fixed.size === 1 &&
    !fixed.has("back") &&
    !dependsOnEntry(byId.get([...fixed][0]!) ?? { id: "", body: {}, transitions: [] })
  ) {
    return `->${[...fixed][0]}`;
  }
  return `by ${rows.map((r) => `${r.from}:${r.to}`).join(",")}`;
}

function readMeaning(t: MachineTransition, nameOf: (id: string) => string): string {
  if (t.to.kind === "state") return `->${nameOf(t.to.id)}`;
  if (t.to.kind === "return") return "return";
  return `by ${[...t.to.routes]
    .map((r) => ({ from: nameOf(r.from), to: r.to.kind === "state" ? nameOf(r.to.id) : "back" }))
    .sort((a, b) => a.from.localeCompare(b.from))
    .map((r) => `${r.from}:${r.to}`)
    .join(",")}`;
}

function describe(meaning: string): string {
  if (meaning === "return") return "going back to wherever it was entered from";
  if (meaning === "nothing") return "nothing";
  if (meaning.startsWith("->")) return `going to ${meaning.slice(2)}`;
  return "something that depends on the way in";
}

const name = (state: { id: string; name?: string } | undefined) => state?.name?.trim() || state?.id || "?";

/** A switch by the marking printed on the hardware: "switch A". */
export function switchName(t: { controlId: number }): string {
  return `switch ${switchSpecForControl(t.controlId)?.name ?? `0x${t.controlId.toString(16)}`}`;
}
