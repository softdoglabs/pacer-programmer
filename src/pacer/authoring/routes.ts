import {
  STEPS_PER_CONTROL,
  SWITCH_CONTROL_IDS,
  SwitchMessageType,
  presetIndexToLabel,
  presetIndexToPresetSelectTarget,
} from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";
import { recoverMachine, type RecoveredMachine } from "../analysis";
import { setStepType, updateStep } from "../editing";

/*
 * Editing the machine, not the presets.
 *
 * A state can be several presets — one per place it returns to — so "make this switch lead there"
 * is a change to every copy at once. Doing it a preset at a time is exactly the hand work this
 * project exists to remove, and it's where the copies drift apart.
 *
 * Nothing is persisted but the dump, so every edit has to leave a configuration the recovery can
 * still read as the design meant (see `analysis/verify.ts`). Here that's checked the same way:
 * the machine is recovered before and after, and an edit that costs a return or makes the
 * configuration unreadable is refused with the reason rather than written and discovered later.
 */

export interface RouteChange {
  /** The state whose switch this is. Every copy of it gets the same change. */
  fromStateId: string;
  controlId: number;
  stepNumber: number;
  /** The state the switch should lead to, or undefined to take the route away. */
  toStateId?: string;
}

export type RouteResult = { ok: true; config: PacerConfig } | { ok: false; error: string };

/** What a switch already carries on a state, so a route can be put somewhere sensible. */
export interface SwitchUse {
  controlId: number;
  /** The route it already carries, if any. */
  route?: { stepNumber: number; toStateId?: string; isReturn: boolean; viaStepping: boolean };
  /** Where a new route would be written: the first step free on every copy, if there is one. */
  freeStep?: number;
  /** How many of its steps already send something, which a press would fire along with the jump. */
  sends: number;
}

function isFree(config: PacerConfig, members: number[], controlId: number, stepNumber: number): boolean {
  return members.every((member) => {
    const step = config.presets[member]?.controls[controlId]?.steps[stepNumber];
    return !step || !step.active || step.msgType === SwitchMessageType.Off;
  });
}

/** Every switch on a state, with what it does now — the material a route picker needs. */
export function switchUses(config: PacerConfig, stateId: string): SwitchUse[] {
  const machine = recoverMachine(config);
  const state = machine.states.find((s) => s.id === stateId);
  const members = machine.members[stateId] ?? [];
  if (!state) return [];

  return SWITCH_CONTROL_IDS.map((controlId) => {
    const transition = state.transitions.find((t) => t.controlId === controlId);
    const steps = [];
    for (let n = 1; n <= STEPS_PER_CONTROL; n++) steps.push(n);
    const freeStep = steps.find((n) => isFree(config, members, controlId, n));
    let sends = 0;
    for (const n of steps) {
      const step = config.presets[members[0] ?? 0]?.controls[controlId]?.steps[n];
      if (step?.active && step.msgType !== SwitchMessageType.Off && !navigates(step.msgType)) sends++;
    }
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
      sends,
    };
  });
}

function navigates(msgType: number): boolean {
  return msgType === SwitchMessageType.PresetSelect || msgType === SwitchMessageType.PresetIncDec;
}

/** Returns as `presetIndex:control:step`, which survives states merging or gaining a copy. */
function returnsByPreset(machine: RecoveredMachine): Set<string> {
  const found = new Set<string>();
  for (const state of machine.states) {
    for (const transition of state.transitions) {
      if (transition.to.kind !== "return") continue;
      for (const member of machine.members[state.id] ?? []) {
        found.add(`${member}:${transition.controlId}:${transition.stepNumber}`);
      }
    }
  }
  return found;
}

/**
 * Points a state's switch at another state, on every copy at once — or takes the route away.
 *
 * A target that returns is refused rather than guessed at: entering it from somewhere new means
 * another copy of it, with its own way back, and that's a slot the device may not have to spare.
 */
export function editRoute(config: PacerConfig, change: RouteChange): RouteResult {
  const before = recoverMachine(config);
  const from = before.states.find((s) => s.id === change.fromStateId);
  const members = before.members[change.fromStateId] ?? [];
  if (!from || members.length === 0) return { ok: false, error: `There's no state "${change.fromStateId}" here.` };

  let target: number | undefined;
  if (change.toStateId !== undefined) {
    const to = before.states.find((s) => s.id === change.toStateId);
    const toMembers = before.members[change.toStateId] ?? [];
    if (!to || toMembers.length === 0) return { ok: false, error: `There's no state "${change.toStateId}" here.` };
    if (toMembers.length > 1) {
      const where = toMembers.map(presetIndexToLabel).join(", ");
      const because = to.transitions.some((t) => t.to.kind === "return")
        ? `it comes back to wherever it was entered from, so each place that enters it needs its own copy (${where}). Entering it from "${from.name?.trim() || from.id}" as well means one more preset.`
        : `it's on the device ${toMembers.length} times (${where}), and nothing says which of them this switch should go to.`;
      return { ok: false, error: `Can't route to "${to.name?.trim() || to.id}": ${because}` };
    }
    target = toMembers[0];
  }

  let edited = config;
  for (const member of members) {
    if (target === undefined) {
      /*
       * Off and inactive, not merely inactive: an inactive step still counts towards what a preset
       * is, so a leftover Preset Select would keep two otherwise identical copies apart.
       */
      edited = setStepType(edited, member, change.controlId, change.stepNumber, "switch", SwitchMessageType.Off);
      if (change.stepNumber > 1)
        edited = updateStep(edited, member, change.controlId, change.stepNumber, { active: false });
    } else {
      edited = setStepType(
        edited,
        member,
        change.controlId,
        change.stepNumber,
        "switch",
        SwitchMessageType.PresetSelect,
      );
      edited = updateStep(edited, member, change.controlId, change.stepNumber, {
        data: [presetIndexToPresetSelectTarget(target), 0, 0],
        active: true,
      });
    }
  }

  const after = recoverMachine(edited);

  /*
   * Returns are the thing to guard. They aren't stored anywhere — a copy returns because it's the
   * only preset that leads back to its one entrant — so a route added into that copy, or taken
   * away from in front of it, quietly turns it into an ordinary jump, and nothing on the hardware
   * would show it.
   */
  const had = returnsByPreset(before);
  const has = returnsByPreset(after);
  const edit = new Set(members.map((m) => `${m}:${change.controlId}:${change.stepNumber}`));
  const lost = [...had].find((key) => !has.has(key) && !edit.has(key));
  if (lost) {
    const [presetIndex] = lost.split(":");
    return {
      ok: false,
      error: `That would stop ${presetIndexToLabel(Number(presetIndex))} coming back to where it was entered from — it would become a plain jump instead.`,
    };
  }

  // Anything the recovery can't read that it could read before. The configuration around an edit
  // may already have its own problems; those aren't this edit's doing.
  const knownNotes = new Set(before.notes.map((n) => n.message));
  const newNote = after.notes.find((n) => !knownNotes.has(n.message));
  if (newNote) return { ok: false, error: `That would leave something unreadable: ${newNote.message}` };

  /*
   * And the route itself reads back as the one asked for. Belt and braces: the two checks above
   * cover what's known to go wrong, while this one holds whatever isn't thought of yet.
   */
  const nowFrom = after.states.find((s) => (after.members[s.id] ?? []).includes(members[0]!));
  const route = nowFrom?.transitions.find(
    (t) => t.controlId === change.controlId && t.stepNumber === change.stepNumber,
  );
  if (change.toStateId === undefined) {
    if (route) return { ok: false, error: "That switch still leads somewhere afterwards." };
  } else {
    const lands = route?.to.kind === "state" ? (after.members[route.to.id] ?? []) : [];
    if (!lands.includes(target!)) {
      return { ok: false, error: `That route doesn't read back as going to ${presetIndexToLabel(target!)}.` };
    }
  }

  return { ok: true, config: edited };
}
