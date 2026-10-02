import { ControlMode, STEPS_PER_CONTROL, SWITCH_CONTROL_IDS, SwitchMessageType } from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";
import { machineOf, presetTransitions } from "../analysis";

/** What a switch already carries on a state, so a route can be put somewhere sensible. */
export interface SwitchUse {
  controlId: number;
  /** The route it already carries, if any. */
  route?: { stepNumber: number; toStateId?: string; isReturn: boolean; viaStepping: boolean };
  /**
   * Where a new route would go: the first step that's free on every copy *and* would actually
   * fire. A press in the default mode takes the first jump it finds and drops the rest, so a
   * later step is somewhere a route would sit and never happen.
   */
  freeStep?: number;
  /**
   * Somewhere the switch already goes that isn't a state of this configuration: the firmware's own
   * Track or Transport preset, or a reload of the one that's loaded. The factory set puts Track on
   * A and Transport on B of every preset, so this is most switches on most devices — and it's why
   * "nothing on it" isn't the same as "free".
   */
  firmwareTarget?: "track" | "transport" | "reload";
  /** How many of its steps already send something, which a press would fire along with the jump. */
  sends: number;
}

function isFree(config: PacerConfig, members: number[], controlId: number, stepNumber: number): boolean {
  return members.every((member) => {
    const step = config.presets[member]?.controls[controlId]?.steps[stepNumber];
    return !step || !step.active || step.msgType === SwitchMessageType.Off;
  });
}

/** True when a press fires every step at once, which is when only the first jump counts. */
function firesAllAtOnce(config: PacerConfig, presetIndex: number, controlId: number): boolean {
  const mode = config.presets[presetIndex]?.controls[controlId]?.controlMode;
  return mode === undefined || mode === ControlMode.AllStepsAtOnce;
}

/** The lowest active step that jumps, which is the only jump a single press makes. */
export function firstJump(config: PacerConfig, presetIndex: number, controlId: number): number | undefined {
  if (!firesAllAtOnce(config, presetIndex, controlId)) return undefined;
  for (let n = 1; n <= STEPS_PER_CONTROL; n++) {
    const step = config.presets[presetIndex]?.controls[controlId]?.steps[n];
    if (step?.active && navigates(step.msgType)) return n;
  }
  return undefined;
}

/** Every switch on a state, with what it does now — the material a route picker needs. */
export function switchUses(config: PacerConfig, stateId: string): SwitchUse[] {
  const machine = machineOf(config);
  const state = machine.states.find((s) => s.id === stateId);
  const members = machine.members[stateId] ?? [];
  if (!state || members.length === 0) return [];
  const graph = presetTransitions(config);

  return SWITCH_CONTROL_IDS.map((controlId) => {
    const transition = state.transitions.find((t) => t.controlId === controlId);
    const steps = [];
    for (let n = 1; n <= STEPS_PER_CONTROL; n++) steps.push(n);

    /*
     * Asked of every copy, not just the first. The copies of a state agree on everything but where
     * their jumps lead — that's what makes them one state — so on a healthy configuration this
     * changes nothing. But it's an answer about *where a route can go*, and the copies are where
     * it goes, so the earliest jump on any of them is the one that decides.
     */
    const jumps = members.map((m) => firstJump(config, m, controlId)).filter((n): n is number => n !== undefined);
    const jump = jumps.length > 0 ? Math.min(...jumps) : undefined;
    // A step after the one that jumps would never fire, so it isn't anywhere to put a route.
    const freeStep = steps.find((n) => (jump === undefined || n < jump) && isFree(config, members, controlId, n));

    const elsewhere = members
      .flatMap((m) => graph.from[m] ?? [])
      .find((e) => e.controlId === controlId && e.target.kind !== "preset");
    const firmwareTarget =
      elsewhere?.target.kind === "special" ? elsewhere.target.preset : elsewhere ? ("reload" as const) : undefined;

    // A step counts as sending only if it sends on every copy, which is what a press anywhere in
    // the state will do.
    const sending = (m: number, n: number) => {
      const step = config.presets[m]?.controls[controlId]?.steps[n];
      return step?.active === true && step.msgType !== SwitchMessageType.Off && !navigates(step.msgType);
    };
    const sends = steps.filter((n) => members.every((m) => sending(m, n))).length;
    return {
      controlId,
      ...(transition
        ? {
            route: {
              stepNumber: transition.stepNumber,
              ...(transition.to.kind === "state" ? { toStateId: transition.to.id } : {}),
              isReturn: transition.to.kind === "return",
              viaStepping: transition.viaStepping === true,
            },
          }
        : {}),
      ...(freeStep !== undefined ? { freeStep } : {}),
      ...(firmwareTarget !== undefined ? { firmwareTarget } : {}),
      sends,
    };
  });
}

function navigates(msgType: number): boolean {
  return msgType === SwitchMessageType.PresetSelect || msgType === SwitchMessageType.PresetIncDec;
}
