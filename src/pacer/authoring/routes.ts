import {
  CURRENT_PRESET_INDEX,
  ControlMode,
  STEPS_PER_CONTROL,
  SWITCH_CONTROL_IDS,
  SwitchMessageType,
  isUserPresetIndex,
  presetIndexToLabel,
  presetIndexToPresetSelectTarget,
  presetSelectTargetToIndex,
} from "../protocol/constants";

import type { PacerConfig } from "../protocol/types";
import {
  isPlainStepping,
  presetTransitions,
  recoverMachine,
  type MachineState,
  type RecoveredMachine,
} from "../analysis";
import { clearControl, clearPreset, copyPreset, isSparePreset, setStepType, updateStep } from "../editing";

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
function firstJump(config: PacerConfig, presetIndex: number, controlId: number): number | undefined {
  if (!firesAllAtOnce(config, presetIndex, controlId)) return undefined;
  for (let n = 1; n <= STEPS_PER_CONTROL; n++) {
    const step = config.presets[presetIndex]?.controls[controlId]?.steps[n];
    if (step?.active && navigates(step.msgType)) return n;
  }
  return undefined;
}

/** Every switch on a state, with what it does now — the material a route picker needs. */
export function switchUses(config: PacerConfig, stateId: string): SwitchUse[] {
  const machine = recoverMachine(config);
  const state = machine.states.find((s) => s.id === stateId);
  const members = machine.members[stateId] ?? [];
  const first = members[0];
  if (!state || first === undefined) return [];
  const graph = presetTransitions(config);

  return SWITCH_CONTROL_IDS.map((controlId) => {
    const transition = state.transitions.find((t) => t.controlId === controlId);
    const steps = [];
    for (let n = 1; n <= STEPS_PER_CONTROL; n++) steps.push(n);

    // A step after the one that jumps would never fire, so it isn't anywhere to put a route.
    const jump = firstJump(config, first, controlId);
    const freeStep = steps.find((n) => (jump === undefined || n < jump) && isFree(config, members, controlId, n));

    const elsewhere = (graph.from[first] ?? []).find((e) => e.controlId === controlId && e.target.kind !== "preset");
    const firmwareTarget =
      elsewhere?.target.kind === "special" ? elsewhere.target.preset : elsewhere ? ("reload" as const) : undefined;

    let sends = 0;
    for (const n of steps) {
      const step = config.presets[first]?.controls[controlId]?.steps[n];
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
      ...(firmwareTarget !== undefined ? { firmwareTarget } : {}),
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
 * A copy of a state the hardware doesn't have yet: one preset each.
 *
 * A state that comes back can't be shared — it has to be one preset per place it can be entered
 * from, because the return address is all that tells those presets apart. So entering it from
 * somewhere new isn't an edit to a switch, it's a new preset.
 *
 * One level deep, which is as far as a configuration can say anything. A state that comes back
 * *and* leads on to another state that comes back would need copies of that one too, and the
 * compiler refuses to write that shape in the first place: with the copies of the outer state
 * leading to different copies of the inner one, nothing in the presets says which of the two
 * switches is the way back (`analysis/verify.ts`).
 */
export interface NeededCopy {
  stateId: string;
  name?: string;
  /** An existing preset of the same state, whose contents this one takes. */
  template: number;
  /** The preset that will enter this copy, and that it comes back to. */
  entryFrom: number;
  /** The switches that carry its way back. */
  returns: { controlId: number; stepNumber: number }[];
  /**
   * A route already on the device that has to be pointed at this copy instead: the switch on a
   * preset that enters the state today and would otherwise keep sharing the old copy. Absent for
   * the route being written, which the edit points itself.
   */
  repoint?: { controlId: number; stepNumber: number };
}

export type RoutePlan =
  /**
   * What the route costs. `copies` is empty when it costs nothing; otherwise one preset each, and
   * the first ones — as many as the state being left has presets — are the copies that state's
   * switches will lead to, in that order.
   *
   * `choice` is the question only a second way in can settle: while a state is entered from one
   * place, a switch that goes back there and a switch that comes back to wherever it was entered
   * from are the same preset, and nothing in the dump says which was meant. Entering it from
   * somewhere else is exactly the moment that has an answer, so it's asked rather than assumed —
   * see `change.asReturn`.
   */
  | {
      ok: true;
      copies: NeededCopy[];
      choice?: { backTo: number; via: { controlId: number; stepNumber: number }[]; sharedBy: number[] };
    }
  | { ok: false; error: string };

/**
 * The presets that lead to `presetIndex` by name.
 *
 * The neighbour walk doesn't count as entering — next/previous names a direction, not a preset —
 * and neither does the Current slot, which is the device's working copy of whatever is loaded
 * rather than a preset of its own (see `recoverMachine`).
 */
export function presetEntrants(config: PacerConfig, presetIndex: number): number[] {
  const graph = presetTransitions(config);
  return [
    ...new Set(
      (graph.into[presetIndex] ?? [])
        .filter((e) => e.from !== presetIndex && e.from !== CURRENT_PRESET_INDEX && !isPlainStepping(config, e))
        .map((e) => e.from),
    ),
  ];
}

/** Where one of a preset's switches leads, as a preset index. */
function targetOfRoute(
  config: PacerConfig,
  presetIndex: number,
  at: { controlId: number; stepNumber: number },
): number | undefined {
  const step = config.presets[presetIndex]?.controls[at.controlId]?.steps[at.stepNumber];
  if (!step?.active || step.msgType !== SwitchMessageType.PresetSelect) return undefined;
  return presetSelectTargetToIndex(step.data[0]);
}

/** Slots a route may not take: the presets it's being written to or from. */
function involved(machine: RecoveredMachine, ids: (string | undefined)[]): Set<number> {
  const used = new Set<number>();
  for (const id of ids) for (const member of id === undefined ? [] : (machine.members[id] ?? [])) used.add(member);
  return used;
}

/**
 * What a route would take, without writing anything: nothing at all, a preset per copy, or a
 * reason it can't be done. The dialog asks this first, so the cost is something to agree to rather
 * than an error after the fact.
 */
export function planRoute(config: PacerConfig, change: RouteChange): RoutePlan {
  const machine = recoverMachine(config);
  const graph = presetTransitions(config);
  const from = machine.states.find((s) => s.id === change.fromStateId);
  const members = machine.members[change.fromStateId] ?? [];
  if (!from || members.length === 0) return { ok: false, error: `There's no state "${change.fromStateId}" here.` };
  if (change.toStateId === undefined) return { ok: true, copies: [] };

  const to = machine.states.find((s) => s.id === change.toStateId);
  const toMembers = machine.members[change.toStateId] ?? [];
  if (!to || toMembers.length === 0) return { ok: false, error: `There's no state "${change.toStateId}" here.` };

  const entrantsOf = (member: number): number[] => presetEntrants(config, member);

  /*
   * A state's way back, whether or not the presets can say so outright. With copies it's the
   * return the recovery found; with one copy it's a switch that leads to a preset that enters it,
   * which is the same preset either way (see `analysis/verify.ts`).
   */
  const wayBack = (state: MachineState): { controlId: number; stepNumber: number }[] => {
    const stateMembers = machine.members[state.id] ?? [];
    if (stateMembers.length !== 1) {
      return state.transitions
        .filter((t) => t.to.kind === "return")
        .map((t) => ({ controlId: t.controlId, stepNumber: t.stepNumber }));
    }
    const entrants = entrantsOf(stateMembers[0]!);
    return state.transitions
      .filter((t) => t.to.kind === "state" && (machine.members[t.to.id] ?? []).some((m) => entrants.includes(m)))
      .map((t) => ({ controlId: t.controlId, stepNumber: t.stepNumber }));
  };

  /*
   * A route being moved to another switch is the same way in, so it costs nothing — the copy it
   * leads to already exists because this route is what made it. Only a new destination is a new
   * way in, and that gets priced below like any other.
   */
  if (change.moveFrom) {
    const current = (graph.from[members[0]!] ?? []).find(
      (e) => e.controlId === change.moveFrom!.controlId && e.stepNumber === change.moveFrom!.stepNumber,
    );
    if (current?.target.kind === "preset" && toMembers.includes(current.target.index)) {
      return { ok: true, copies: [] };
    }
  }

  const targetWayBack = wayBack(to);
  const settled = (machine.members[to.id] ?? []).length > 1;
  if (targetWayBack.length === 0) {
    if (toMembers.length > 1) {
      const where = toMembers.map(presetIndexToLabel).join(", ");
      return {
        ok: false,
        error: `Can't route to "${to.name?.trim() || to.id}": it's on the device ${toMembers.length} times (${where}), and nothing says which of them this switch should go to.`,
      };
    }
    return { ok: true, copies: [] };
  }

  /*
   * One copy, and nothing settles what its way back means: a switch that goes to A1 and a switch
   * that comes back to whoever entered it are the same preset while A1 is the only way in. The
   * answer is left to the caller, and until it says otherwise the route just joins what's there.
   */
  const sharedBy = settled ? [] : entrantsOf(toMembers[0]!);
  const choice = settled ? undefined : { backTo: sharedBy[0]!, via: targetWayBack, sharedBy };
  if (choice && change.asReturn !== true) return { ok: true, copies: [], choice };

  /*
   * A copy per place the state is entered from, because the way back is all that tells the copies
   * apart. When it's already settled, the copies that exist keep their origins and only this route
   * needs one. When it isn't, saying "it comes back" means every origin needs its own: the one
   * copy there is keeps whichever origin it already leads to, and the rest — the presets that have
   * been sharing it — are pointed at copies of their own.
   */
  const keeps = settled ? undefined : targetOfRoute(config, toMembers[0]!, targetWayBack[0]!); // the origin the one copy goes back to
  const alsoNeeding = settled ? [] : sharedBy.filter((origin) => origin !== keeps);

  const copies: NeededCopy[] = [
    ...members.map((member) => ({
      stateId: to.id,
      ...(to.name !== undefined ? { name: to.name } : {}),
      template: toMembers[0]!,
      entryFrom: member,
      returns: targetWayBack,
    })),
    ...alsoNeeding.flatMap((origin) => {
      // The switch that origin uses to get there today, which has to lead to its own copy instead.
      const edge = (graph.from[origin] ?? []).find(
        (e) => e.target.kind === "preset" && toMembers.includes(e.target.index),
      );
      return edge
        ? [
            {
              stateId: to.id,
              ...(to.name !== undefined ? { name: to.name } : {}),
              template: toMembers[0]!,
              entryFrom: origin,
              returns: targetWayBack,
              repoint: { controlId: edge.controlId, stepNumber: edge.stepNumber },
            },
          ]
        : [];
    }),
  ];

  return { ok: true, copies, ...(choice ? { choice } : {}) };
}

/**
 * Points a state's switch at another state, on every copy at once — or takes the route away.
 *
 * `into` says which presets the copies in `planRoute`'s answer may take, in its order. A route
 * that needs none takes none.
 */
export function editRoute(config: PacerConfig, change: RouteChange, into: readonly number[] = []): RouteResult {
  const before = recoverMachine(config);
  const from = before.states.find((s) => s.id === change.fromStateId);
  const members = before.members[change.fromStateId] ?? [];
  if (!from || members.length === 0) return { ok: false, error: `There's no state "${change.fromStateId}" here.` };

  const plan = planRoute(config, change);
  if (!plan.ok) return plan;

  if (plan.copies.length !== into.length) {
    const name = before.states.find((s) => s.id === change.toStateId)?.name?.trim() || change.toStateId;
    return {
      ok: false,
      error:
        plan.copies.length === 0
          ? "That route needs no presets of its own."
          : `"${name}" comes back to wherever it was entered from, so entering it from here needs ${plan.copies.length} more preset${plan.copies.length === 1 ? "" : "s"}. Say which.`,
    };
  }

  // Nothing a copy could take: the presets this route runs between, and the ones whose own routes
  // are being pointed at copies.
  const reserved = involved(before, [change.fromStateId, change.toStateId]);
  for (const copy of plan.copies) reserved.add(copy.entryFrom);
  for (const slot of into) {
    if (!isUserPresetIndex(slot)) return { ok: false, error: `${slot} isn't one of the Pacer's 24 presets.` };
    if (reserved.has(slot)) {
      return {
        ok: false,
        error: `${presetIndexToLabel(slot)} is one of the presets this route runs between, so a copy can't take it.`,
      };
    }
  }
  if (new Set(into).size !== into.length) return { ok: false, error: "Two copies can't go in the same preset." };

  /*
   * A press in the default mode fires every step but takes only the first jump it finds (the
   * engine warns about the rest). A route written after one would sit there and never happen —
   * most often behind the Track selector the factory set puts on switch A.
   */
  if (change.toStateId !== undefined && change.replace !== true) {
    for (const member of members) {
      const jump = firstJump(config, member, change.controlId);
      if (jump !== undefined && jump < change.stepNumber) {
        return {
          ok: false,
          error: `Step ${jump} on that switch already jumps somewhere, and a press only takes the first jump — a route on step ${change.stepNumber} would never fire.`,
        };
      }
    }
  }

  let edited = config;

  // Asked for: the switch stops doing whatever it did, on every preset the state is, and the
  // route is all that's left on it.
  if (change.replace === true) {
    for (const member of members) edited = clearControl(edited, member, change.controlId);
  }

  /*
   * The copies first, so the route has somewhere to lead. Each is the state as it already exists,
   * with its way back pointed at whatever enters this one — which is the only thing that tells the
   * copies of a returning state apart.
   */
  plan.copies.forEach((copy, at) => {
    const slot = into[at]!;
    edited = copyPreset(edited, copy.template, slot);
    for (const { controlId, stepNumber } of copy.returns) {
      edited = writeJump(edited, slot, controlId, stepNumber, copy.entryFrom);
    }
    // A preset that was sharing the old copy now has one of its own, so its own switch follows.
    if (copy.repoint) {
      edited = writeJump(edited, copy.entryFrom, copy.repoint.controlId, copy.repoint.stepNumber, slot);
    }
  });

  // Then the route itself: each preset the state is gets the same switch, leading to its own copy
  // when copies were made, or to the one preset the target state is when it needed none.
  const single = change.toStateId === undefined ? undefined : (before.members[change.toStateId] ?? [])[0];
  members.forEach((member, i) => {
    if (change.toStateId === undefined) {
      /*
       * Off and inactive, not merely inactive: an inactive step still counts towards what a preset
       * is, so a leftover Preset Select would keep two otherwise identical copies apart.
       */
      edited = setStepType(edited, member, change.controlId, change.stepNumber, "switch", SwitchMessageType.Off);
      if (change.stepNumber > 1)
        edited = updateStep(edited, member, change.controlId, change.stepNumber, { active: false });
      return;
    }
    edited = writeJump(
      edited,
      member,
      change.controlId,
      change.stepNumber,
      plan.copies.length > 0 ? into[i]! : single!,
    );
  });

  // Moved, not copied: the switch it used to be on gives it up in the same edit.
  const moveFrom = change.moveFrom;
  if (moveFrom && (moveFrom.controlId !== change.controlId || moveFrom.stepNumber !== change.stepNumber)) {
    for (const member of members) {
      edited = setStepType(edited, member, moveFrom.controlId, moveFrom.stepNumber, "switch", SwitchMessageType.Off);
      if (moveFrom.stepNumber > 1) {
        edited = updateStep(edited, member, moveFrom.controlId, moveFrom.stepNumber, { active: false });
      }
    }
  }

  const after = recoverMachine(edited);

  /*
   * Returns are the thing to guard. They aren't stored anywhere — a copy returns because it's the
   * only preset that leads back to its one entrant — so a route added into that copy, or taken
   * away from in front of it, quietly turns it into an ordinary jump, and nothing on the hardware
   * would show it. A preset a copy has taken over is left out: whatever it used to come back to
   * was written over knowingly.
   */
  const had = returnsByPreset(before);
  const has = returnsByPreset(after);
  const edit = new Set(
    members.flatMap((m) => [
      `${m}:${change.controlId}:${change.stepNumber}`,
      ...(moveFrom ? [`${m}:${moveFrom.controlId}:${moveFrom.stepNumber}`] : []),
    ]),
  );
  const taken = new Set(into);
  const lost = [...had].find(
    (key) => !has.has(key) && !edit.has(key) && !taken.has(Number(key.slice(0, key.indexOf(":")))),
  );
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
   * And the route itself reads back as the one asked for. Belt and braces: the checks above cover
   * what's known to go wrong, while this one holds whatever isn't thought of yet.
   */
  const nowFrom = after.states.find((s) => (after.members[s.id] ?? []).includes(members[0]!));
  const route = nowFrom?.transitions.find(
    (t) => t.controlId === change.controlId && t.stepNumber === change.stepNumber,
  );
  if (change.toStateId === undefined) {
    if (route) return { ok: false, error: "That switch still leads somewhere afterwards." };
  } else {
    const landed = plan.copies.length > 0 ? into[0]! : single!;
    const lands = route?.to.kind === "state" ? (after.members[route.to.id] ?? []) : [];
    if (!lands.includes(landed)) {
      return { ok: false, error: `That route doesn't read back as going to ${presetIndexToLabel(landed)}.` };
    }
  }

  return { ok: true, config: edited };
}

/** One switch step, made into a jump to a preset. */
function writeJump(
  config: PacerConfig,
  presetIndex: number,
  controlId: number,
  stepNumber: number,
  target: number,
): PacerConfig {
  const typed = setStepType(config, presetIndex, controlId, stepNumber, "switch", SwitchMessageType.PresetSelect);
  return updateStep(typed, presetIndex, controlId, stepNumber, {
    data: [presetIndexToPresetSelectTarget(target), 0, 0],
    active: true,
  });
}

/**
 * Moves a preset into another slot, with everything that led to it following.
 *
 * A state's copies land wherever the app found room, which is rarely where you'd have put them —
 * the looper's three copies scattered through banks B and D rather than sitting together. Moving
 * one is a copy, a clear, and then the part that can't be done by hand without missing something:
 * every Preset Select anywhere in the configuration that named the old slot now names the new one.
 *
 * Relative stepping is deliberately left alone. Next/previous names a direction, not a preset, so
 * there's nothing in it to repoint — the preset that steps to its neighbour now steps to whatever
 * its new neighbour is, which is what stepping means.
 */
export function movePreset(config: PacerConfig, from: number, to: number): RouteResult {
  if (!isUserPresetIndex(from) || !isUserPresetIndex(to)) {
    return { ok: false, error: "Presets move between the Pacer's own 24 slots." };
  }
  if (from === to) return { ok: true, config };
  if (!isSparePreset(config.presets[to])) {
    return { ok: false, error: `${presetIndexToLabel(to)} has something in it. Clear it first, or pick an empty one.` };
  }

  let moved = clearPreset(copyPreset(config, from, to), from);
  const graph = presetTransitions(config);
  for (const edge of graph.edges) {
    if (edge.target.kind !== "preset" || edge.target.index !== from) continue;
    if (isPlainStepping(config, edge)) continue;
    moved = writeJump(moved, edge.from, edge.controlId, edge.stepNumber, to);
  }

  /*
   * The same round trip every other edit here is held to: the machine recovered afterwards has to
   * be the one recovered before, give or take which slots it sits in.
   */
  const before = machineShape(config, recoverMachine(config), { [from]: to });
  const after = machineShape(moved, recoverMachine(moved), {});
  if (before !== after) {
    return { ok: false, error: `Moving ${presetIndexToLabel(from)} would change what the configuration does.` };
  }
  return { ok: true, config: moved };
}

/**
 * A machine as something comparable: each state by the presets it is and where each of its routes
 * leads, with `rename` applied so a move can be checked against the design it started as. Names
 * are left out — they're labels, and a state's identity is what it does.
 */
function machineShape(config: PacerConfig, machine: RecoveredMachine, rename: Partial<Record<number, number>>): string {
  const slot = (index: number) => rename[index] ?? index;
  // Empty presets aren't part of the shape: the slot a move leaves behind is one of them, and a
  // configuration with a spare slot more or less is the same configuration.
  const states = machine.states
    .filter((state) => !(machine.members[state.id] ?? []).every((m) => isSparePreset(config.presets[m])))
    .map((state) => ({
      members: (machine.members[state.id] ?? []).map(slot).sort((a, b) => a - b),
      routes: state.transitions
        .map((t) => ({
          c: t.controlId,
          n: t.stepNumber,
          to: t.to.kind === "return" ? "return" : (machine.members[t.to.id] ?? []).map(slot).sort((a, b) => a - b),
        }))
        .sort((a, b) => a.c - b.c || a.n - b.n),
    }));
  return JSON.stringify(states.sort((a, b) => a.members[0]! - b.members[0]!));
}
