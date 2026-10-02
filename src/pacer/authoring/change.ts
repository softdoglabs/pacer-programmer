import type { PacerConfig } from "../protocol/types";

/** What a route edit asks for, and what any authoring edit answers. */

export interface RouteChange {
  /** The state whose switch this is. Every copy of it gets the same change. */
  fromStateId: string;
  controlId: number;
  stepNumber: number;
  /** The state the switch should lead to, or undefined to take the route away. */
  toStateId?: string;
  /**
   * The state being entered comes back to wherever it was entered from, rather than always to the
   * one place that enters it today. Only asked when that's still an open question — see
   * `RoutePlan.choice` — and it's what makes the route cost a preset.
   */
  asReturn?: boolean;
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
