// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { SwitchMessageType, presetIndexToLabel } from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";
import {
  dependsOnEntry,
  machineOf,
  stateContaining,
  type EntryRoute,
  type EntryTarget,
  type MachineState,
  type MachineTarget,
  type MachineTransition,
  type RecoveredMachine,
  type StateMachine,
} from "../analysis";
import { clearControl, clearPreset, setStepType, updateStep } from "../editing";
import type { RouteChange } from "./change";
import { entrantStates } from "./plan";
import { realize, type CopyNeed } from "./realize";
import { clearablePresets } from "./slots";
import { firstJump } from "./switches";

/**
 * Points a state's switch somewhere — another state, back, or a table by way in — on every copy at
 * once, or takes the route away. The change is made to the machine, and `realize` works out which
 * presets that machine needs: copies added where a switch now depends on the way in (into the slots
 * in `into`, in the order `planRoute` lists them), copies freed where it no longer does.
 *
 * `clearing` names presets in use to empty first, so a copy can take one on a device with none
 * empty. Only presets the machine doesn't use (`clearablePresets`); asking is the caller's job.
 */
export type RouteOutcome =
  | { ok: true; config: PacerConfig; added: number[]; freed: number[] }
  | { ok: false; error: string; needs?: CopyNeed[]; freed?: number[] };

export function editRoute(
  config: PacerConfig,
  change: RouteChange,
  into: readonly number[] = [],
  { dryRun = false, clearing = [] }: { dryRun?: boolean; clearing?: readonly number[] } = {},
): RouteOutcome {
  if (clearing.length > 0) {
    const cleared = clearFirst(config, change, clearing);
    if ("error" in cleared) return { ok: false, error: cleared.error };
    ({ config, change } = cleared);
  }
  const before = machineOf(config);
  const from = before.states.find((s) => s.id === change.fromStateId);
  const members = before.members[change.fromStateId] ?? [];
  if (!from || members.length === 0) return { ok: false, error: `There's no state "${change.fromStateId}" here.` };

  const leadsTo = change.to ? targetStates(change.to) : [];
  if (leadsTo.includes(change.fromStateId)) {
    return {
      ok: false,
      error:
        "A route can't lead to the state it leaves from. To reload the preset, give the step Preset Select → Current.",
    };
  }
  const missing = leadsTo.find((id) => !before.states.some((s) => s.id === id));
  if (missing) return { ok: false, error: `There's no state "${missing}" here.` };

  /*
   * A press in the default mode fires every step but takes only the first jump it finds (the
   * engine warns about the rest). A route written after one would sit there and never happen —
   * most often behind the Track selector the factory set puts on switch A.
   */
  if (change.to && change.replace !== true) {
    for (const member of members) {
      const jump = firstJump(config, member, change.controlId);
      const movingOff = change.moveFrom?.controlId === change.controlId && change.moveFrom.stepNumber === jump;
      if (jump !== undefined && jump < change.stepNumber && !movingOff) {
        return {
          ok: false,
          error: `Step ${jump} on that switch already jumps somewhere, and a press only takes the first jump — a route on step ${change.stepNumber} would never fire.`,
        };
      }
    }
  }

  // The steps themselves, on every preset the state is: emptied, turned off, or moved off.
  let edited = config;
  if (change.replace === true) for (const m of members) edited = clearControl(edited, m, change.controlId);
  const turnOff = (c: { controlId: number; stepNumber: number }) => {
    for (const m of members) {
      /*
       * Off and inactive, not merely inactive: an inactive step still counts towards what a preset
       * is, so a leftover Preset Select would keep two otherwise identical copies apart.
       */
      edited = setStepType(edited, m, c.controlId, c.stepNumber, "switch", SwitchMessageType.Off);
      if (c.stepNumber > 1) edited = updateStep(edited, m, c.controlId, c.stepNumber, { active: false });
    }
  };
  if (!change.to) turnOff(change);
  const moveFrom = change.moveFrom;
  const moving = moveFrom && (moveFrom.controlId !== change.controlId || moveFrom.stepNumber !== change.stepNumber);
  if (moving) turnOff(moveFrom);

  // The machine afterwards.
  const after = edit(before, change);
  if (typeof after === "string") return { ok: false, error: after };

  /*
   * The states whose presets this edit may add or free: the one being edited, wherever its switch
   * led and now leads, and everything entered from inside those through a switch that depends on
   * the way in — a copy added to a looper is a new way into its tuner, which needs one too.
   */
  const affected = new Set<string>([change.fromStateId, ...leadsTo]);
  const was = from.transitions.filter(
    (t) =>
      (t.controlId === change.controlId && t.stepNumber === change.stepNumber) ||
      (moveFrom && t.controlId === moveFrom.controlId && t.stepNumber === moveFrom.stepNumber),
  );
  for (const t of was) for (const id of targetStates(t.to)) affected.add(id);
  const byId = new Map(after.states.map((s) => [s.id, s]));
  for (const queue = [...affected]; queue.length > 0;) {
    const state = byId.get(queue.shift()!);
    for (const t of state?.transitions ?? []) {
      for (const id of targetStates(t.to)) {
        const target = byId.get(id);
        if (target && dependsOnEntry(target) && !affected.has(id)) {
          affected.add(id);
          queue.push(id);
        }
      }
    }
  }

  const result = realize(edited, before, after, into, affected);
  if (!result.ok) return result;
  if (dryRun) return { ok: true, config, added: [], freed: result.freed };
  return result;
}

/**
 * Empties the presets a copy is about to take, and restates the change in the ids the states have
 * afterwards. An id is a state's name, qualified by its slot only while another state shares the
 * name — so clearing a preset can rename a state the change refers to, and the change would then
 * name a state that isn't there. States are followed by the presets they are, which don't move.
 */
function clearFirst(
  config: PacerConfig,
  change: RouteChange,
  clearing: readonly number[],
): { config: PacerConfig; change: RouteChange } | { error: string } {
  const before = machineOf(config);
  const involved = [change.fromStateId, ...(change.to ? targetStates(change.to) : [])];
  const allowed = clearablePresets(config, before, involved);
  const refused = clearing.find((slot) => !allowed.includes(slot));
  if (refused !== undefined) {
    return { error: `${presetIndexToLabel(refused)} is part of a route, so it can't be cleared to make room.` };
  }
  const cleared = clearing.reduce((c, slot) => clearPreset(c, slot), config);
  const after = machineOf(cleared);
  const idNow = (id: string): string => {
    const preset = (before.members[id] ?? [])[0];
    return (preset === undefined ? undefined : stateContaining(after, preset)?.state.id) ?? id;
  };
  const entry = <T extends EntryTarget>(to: T): T => (to.kind === "state" ? { ...to, id: idNow(to.id) } : to);
  const target = (to: MachineTarget): MachineTarget =>
    to.kind === "byEntry"
      ? { kind: "byEntry", routes: to.routes.map((r) => ({ from: idNow(r.from), to: entry(r.to) })) }
      : entry(to);
  return {
    config: cleared,
    change: {
      ...change,
      fromStateId: idNow(change.fromStateId),
      ...(change.to ? { to: target(change.to) } : {}),
      ...(change.entering
        ? { entering: Object.fromEntries(Object.entries(change.entering).map(([k, v]) => [k, entry(v)])) }
        : {}),
    },
  };
}

/** Every state a target can lead to. */
function targetStates(to: MachineTarget): string[] {
  if (to.kind === "state") return [to.id];
  if (to.kind === "return") return [];
  return to.routes.flatMap((r) => (r.to.kind === "state" ? [r.to.id] : []));
}

/** The machine with the change made: the switch rerouted, and the states it enters told where to go. */
function edit(before: RecoveredMachine, change: RouteChange): StateMachine | string {
  const slot = (t: { controlId: number; stepNumber: number }) => `${t.controlId}:${t.stepNumber}`;
  const here = slot(change);
  const away = change.moveFrom ? slot(change.moveFrom) : undefined;
  const states: MachineState[] = before.states.map((s) => ({ ...s, transitions: [...s.transitions] }));
  const byId = new Map(states.map((s) => [s.id, s]));
  const state = byId.get(change.fromStateId)!;

  state.transitions = state.transitions.filter((t) => slot(t) !== here && slot(t) !== away);
  if (change.to) {
    // A table needs a row for every way in, or the copy entered from the missing one has nowhere to go.
    if (change.to.kind === "byEntry") {
      const routes = change.to.routes;
      const lacking = entrantStates(before, change.fromStateId).find((w) => !routes.some((r) => r.from === w));
      if (lacking) return `That doesn't say where the switch leads when entered from "${lacking}".`;
    }
    state.transitions.push({ controlId: change.controlId, stepNumber: change.stepNumber, to: change.to });
  }

  /*
   * A state this route enters, whose switches depend on the way in, gains a way in — so each of
   * those switches needs to say where it leads from here. A return already does (back); a table
   * gets a row, back unless the change says otherwise; and a return the change sends somewhere
   * else from here becomes a table.
   */
  for (const id of change.to ? targetStates(change.to) : []) {
    const target = byId.get(id)!;
    if (!dependsOnEntry(target)) continue;
    const ways = entrantStates(before, id);
    target.transitions = target.transitions.map((t): MachineTransition => {
      const wanted = change.entering?.[slot(t)] ?? { kind: "return" as const };
      if (t.to.kind === "state") return t;
      if (t.to.kind === "return") {
        if (wanted.kind === "return") return t;
        const routes: EntryRoute[] = ways.map((w) => ({ from: w, to: { kind: "return" } }));
        return { ...t, to: { kind: "byEntry", routes: [...routes, { from: change.fromStateId, to: wanted }] } };
      }
      const routes = t.to.routes.filter((r) => r.from !== change.fromStateId);
      return { ...t, to: { kind: "byEntry", routes: [...routes, { from: change.fromStateId, to: wanted }] } };
    });
  }
  return { states };
}
