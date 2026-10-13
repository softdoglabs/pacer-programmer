// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import type { RecoveredMachine } from "../analysis";
import { isSparePreset } from "../editing";
import { FIRST_USER_PRESET_INDEX, LAST_USER_PRESET_INDEX } from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";

/*
 * Which presets something new may be put in: a copy of a state, or a preset being moved.
 *
 * Asked in one place because it's one rule. It used to be worked out by each piece of UI that
 * needed a slot, which is how the route dialog and Move to… both came to offer nothing at all on
 * a device with every preset in use — which is every device until something's been cleared.
 */

export interface SlotChoices {
  /** Presets with nothing in them, which can be taken as they are. */
  empty: number[];
  /** Presets in use that may be cleared to make room, once that's been agreed to. */
  clearable: number[];
}

/**
 * The presets with something in them that could still be taken once cleared. Only presets the
 * machine doesn't use: one that's a state by itself, that nothing leads to by name and that has no
 * designed route of its own. Clearing any other would change the machine an edit was priced on.
 * `except` names states the edit itself involves, which may have no way in yet but are about to.
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

/** Where something new may go: the empty presets, and the ones that may be cleared for it. */
export function slotChoices(
  config: PacerConfig,
  machine: RecoveredMachine,
  except: readonly string[] = [],
): SlotChoices {
  const empty: number[] = [];
  for (let i = FIRST_USER_PRESET_INDEX; i <= LAST_USER_PRESET_INDEX; i++) {
    if (isSparePreset(config.presets[i])) empty.push(i);
  }
  return { empty, clearable: clearablePresets(config, machine, except) };
}
