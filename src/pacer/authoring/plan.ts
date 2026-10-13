// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

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
