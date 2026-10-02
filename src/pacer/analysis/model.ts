import type { Preset } from "../protocol/types";

/*
 * The state machine a configuration is: states, and the transitions between them.
 *
 * Nothing here is persisted. The presets are the only record, and a machine is what `recoverMachine`
 * reads out of them; the editor changes it by changing presets (see `pacer/authoring`), and reads
 * it back again. Whatever can be authored has to be recoverable — that's the invariant every edit
 * is checked against (`whatWasLost`).
 */

/** Where a transition leads. */
export type MachineTarget =
  | { kind: "state"; id: string }
  /**
   * Back to whatever entered this state. The hardware has no such action — this is exactly what
   * forces a state to be duplicated, once per distinct place it can return to.
   */
  | { kind: "return" };

export interface MachineTransition {
  controlId: number;
  stepNumber: number;
  to: MachineTarget;
  /**
   * This is a Preset Inc/Dec that does nothing but move to the neighbouring preset. Every factory
   * preset has two, so a map that draws them all is mostly furniture — see `ui/map`.
   */
  viaStepping?: boolean;
}

export interface MachineState {
  id: string;
  /** The preset name its presets share, which is the only name a dump can carry for a state. */
  name?: string;
  /** What the state's controls do, exactly as a preset holds them — minus navigation, which the transitions own. */
  body: Preset["controls"];
  transitions: MachineTransition[];
}

export interface StateMachine {
  states: MachineState[];
}
