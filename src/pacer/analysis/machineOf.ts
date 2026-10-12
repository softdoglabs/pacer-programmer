// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import type { PacerConfig } from "../protocol/types";
import { recoverMachine, type RecoveredMachine } from "./recover";

/*
 * The state machine a configuration is, one object per configuration.
 *
 * Everything that asks what the states are — the map, the chooser, the editor's targets, the
 * route dialog, the authoring checks — gets the same answer by getting the same object. Before,
 * each worked it out for itself, at its own moment, so two parts of one screen could each hold a
 * view of the states and nothing kept them in step. It's cheap (about half a millisecond on a real
 * dump); the point isn't speed, it's that there is one.
 *
 * Configurations are never changed in place — every edit copies the path it touches — so a config
 * object *is* a version, and identity is an exact key. A WeakMap lets old versions go with the undo
 * history that held them.
 *
 * The machine handed out is shared: treat it as read-only.
 */

const machines = new WeakMap<PacerConfig, RecoveredMachine>();

export function machineOf(config: PacerConfig): RecoveredMachine {
  let machine = machines.get(config);
  if (!machine) {
    machine = recoverMachine(config);
    machines.set(config, machine);
  }
  return machine;
}

/** The state a preset is one of, with all the presets that state is. */
export function stateContaining(
  machine: RecoveredMachine,
  presetIndex: number,
): { state: RecoveredMachine["states"][number]; members: number[] } | undefined {
  const state = machine.states.find((s) => (machine.members[s.id] ?? []).includes(presetIndex));
  return state ? { state, members: machine.members[state.id] ?? [] } : undefined;
}
