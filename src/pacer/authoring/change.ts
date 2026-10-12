// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import type { PacerConfig } from "../protocol/types";
import type { EntryTarget, MachineTarget } from "../analysis";

/** What a route edit asks for, and what any authoring edit answers. */

export interface RouteChange {
  /** The state whose switch this is. Every copy of it gets the same change. */
  fromStateId: string;
  controlId: number;
  stepNumber: number;
  /**
   * Where the switch should lead: always to one state, back to wherever this state was entered
   * from, or a table of where it leads from each way in. Undefined takes the route away.
   */
  to?: MachineTarget;
  /**
   * Where the switches of a state this route enters lead when it's entered from here, for a state
   * whose switches depend on the way in. Keyed by `"controlId:stepNumber"`. A switch left out goes
   * back, which is what a return means.
   */
  entering?: Record<string, EntryTarget>;
  /**
   * The switch this route is on now, when it's being moved to another one. Cleared as part of the
   * same edit, so the route is never on two switches and never on none.
   */
  moveFrom?: { controlId: number; stepNumber: number };
  /**
   * Empty the switch first, so the route is all it does. Most switches on a real device are busy:
   * the factory set gives A and B to the firmware's DAW presets and 1-6 to sending MIDI, so
   * without this there's often nowhere a route could go — and a route written behind an earlier
   * jump would never fire (see `SwitchUse.freeStep`).
   */
  replace?: boolean;
}

export type RouteResult = { ok: true; config: PacerConfig } | { ok: false; error: string };
