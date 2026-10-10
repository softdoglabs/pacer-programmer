import type { Preset } from "../protocol/types";

/*
 * The state machine a configuration is: states, and the transitions between them.
 *
 * Nothing here is persisted. The presets are the only record, and a machine is what `recoverMachine`
 * reads out of them; the editor changes it by changing presets (see `pacer/authoring`), and reads
 * it back again. Whatever can be authored has to be recoverable — that's the invariant every edit
 * is checked against.
 *
 * A switch on a state either always leads to the same state, or leads somewhere that depends on
 * how the state was entered. The second is the only thing the hardware can't do directly: a preset's
 * jump has one fixed target, so a state whose switch must lead to different places needs a preset
 * per distinct set of destinations. That's the whole reason a state is ever more than one preset.
 */

/** Where a transition leads from one particular way in: a state, or back to whatever entered. */
export type EntryTarget = { kind: "state"; id: string } | { kind: "return" };

/** One row of a transition that depends on the way in. */
export interface EntryRoute {
  /** The state this state was entered from. */
  from: string;
  to: EntryTarget;
}

/** Where a transition leads. */
export type MachineTarget =
  | { kind: "state"; id: string }
  /**
   * Back to whatever entered this state, from every way in. The hardware has no such action — this
   * is what forces a state to be duplicated, once per distinct place it can return to.
   */
  | { kind: "return" }
  /**
   * Somewhere that depends on the way in, but not simply "back" from all of them: back to MAIN0 and
   * MAIN1 when entered from those, but to MAIN0 when entered from MAIN3. One row per state that
   * enters this one. Needs a preset per distinct set of destinations.
   */
  | { kind: "byEntry"; routes: EntryRoute[] };

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

/** Whether any of a state's switches leads somewhere that depends on how it was entered. */
export function dependsOnEntry(state: MachineState): boolean {
  return state.transitions.some((t) => t.to.kind === "return" || t.to.kind === "byEntry");
}

/** Where a transition leads when the state was entered from `from`. */
export function routeFrom(target: MachineTarget, from: string): EntryTarget | undefined {
  if (target.kind !== "byEntry") return target;
  return target.routes.find((r) => r.from === from)?.to;
}
