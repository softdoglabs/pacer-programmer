// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { isSparePreset } from "../editing";
import { FIRST_USER_PRESET_INDEX, LAST_USER_PRESET_INDEX } from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";
import type { RecoveredMachine } from "../analysis";
import type { RouteChange } from "./change";
import { editRoute, type RouteOutcome } from "./editRoute";
import type { CopyNeed } from "./realize";

/**
 * What a route would take, without writing anything: the copies it needs a preset for, and the
 * presets it would free. It's the edit itself run with no slots to spend, so the cost a dialog
 * shows is exactly what the edit will do.
 */
export type RoutePlan = { ok: true; needs: CopyNeed[]; freed: number[] } | { ok: false; error: string };

export function planRoute(config: PacerConfig, change: RouteChange): RoutePlan {
  const outcome: RouteOutcome = editRoute(config, change, [], { dryRun: true });
  if (outcome.ok) return { ok: true, needs: [], freed: outcome.freed };
  if (outcome.needs) return { ok: true, needs: outcome.needs, freed: outcome.freed ?? [] };
  return { ok: false, error: outcome.error };
}

/** The states that enter `stateId`: its ways in, by state. */
export function entrantStates(machine: RecoveredMachine, stateId: string): string[] {
  const stateOf = new Map<number, string>();
  for (const s of machine.states) for (const m of machine.members[s.id] ?? []) stateOf.set(m, s.id);
  const found = new Set<string>();
  for (const m of machine.members[stateId] ?? []) {
    for (const w of machine.waysIn[m] ?? []) {
      const s = stateOf.get(w);
      if (s !== undefined && s !== stateId) found.add(s);
    }
  }
  return [...found].sort();
}

/**
 * The presets with something in them that a copy could still take once cleared, for a device with
 * no empty preset left — which is every device until something's been cleared. Only presets the
 * machine doesn't use: one that's a state by itself, that nothing leads to by name and that has no
 * designed route of its own. Clearing any other would change the machine the route was priced on.
 * `except` names states the route itself involves, which have no way in yet but are about to.
 */
export function clearablePresets(
  config: PacerConfig,
  machine: RecoveredMachine,
  except: readonly string[] = [],
): number[] {
  const found: number[] = [];
  for (const state of machine.states) {
    const members = machine.members[state.id] ?? [];
    if (members.length !== 1 || except.includes(state.id)) continue;
    const preset = members[0]!;
    if (preset < FIRST_USER_PRESET_INDEX || preset > LAST_USER_PRESET_INDEX) continue;
    if (isSparePreset(config.presets[preset])) continue;
    if ((machine.waysIn[preset] ?? []).length > 0) continue;
    if (state.transitions.some((t) => !t.viaStepping)) continue;
    found.push(preset);
  }
  return found.sort((a, b) => a - b);
}
