import { SwitchMessageType, presetIndexToLabel, presetSelectTargetToIndex } from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";
import { machineOf, presetEntrants, presetTransitions, wayBack, type RecoveredMachine } from "../analysis";
import type { RouteChange } from "./change";

/**
 * A copy of a state the hardware doesn't have yet: one preset each.
 *
 * A state that comes back can't be shared — it has to be one preset per place it can be entered
 * from, because the return address is all that tells those presets apart. So entering it from
 * somewhere new isn't an edit to a switch, it's a new preset.
 *
 * One level deep, which is as far as a configuration can say anything. A state that comes back
 * *and* leads on to another state that comes back would need copies of that one too, and that
 * shape can't be read back: with the copies of the outer state leading to different copies of the
 * inner one, nothing in the presets says which of the two switches is the way back.
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

/** Where one of a preset's switches leads, as a preset index. */
export function targetOfRoute(
  config: PacerConfig,
  presetIndex: number,
  at: { controlId: number; stepNumber: number },
): number | undefined {
  const step = config.presets[presetIndex]?.controls[at.controlId]?.steps[at.stepNumber];
  if (!step?.active || step.msgType !== SwitchMessageType.PresetSelect) return undefined;
  return presetSelectTargetToIndex(step.data[0]);
}

/**
 * Where each of the state's presets already leads, if the route being edited already enters the
 * target state from every one of them — read from the step it's on now (`moveFrom`, or the step
 * itself when it stays put). Each preset keeps its own: the copies of a state that comes back are
 * told apart by exactly this, so pointing them all at one would undo them.
 */
export function existingEntry(
  config: PacerConfig,
  change: RouteChange,
  members: readonly number[],
  toMembers: readonly number[],
): number[] | undefined {
  const at = change.moveFrom ?? { controlId: change.controlId, stepNumber: change.stepNumber };
  const targets = members.map((member) => targetOfRoute(config, member, at));
  return targets.every((t): t is number => t !== undefined && toMembers.includes(t)) ? targets : undefined;
}

/** Slots a route may not take: the presets it's being written to or from. */
export function involved(machine: RecoveredMachine, ids: (string | undefined)[]): Set<number> {
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
  const machine = machineOf(config);
  const graph = presetTransitions(config);
  const from = machine.states.find((s) => s.id === change.fromStateId);
  const members = machine.members[change.fromStateId] ?? [];
  if (!from || members.length === 0) return { ok: false, error: `There's no state "${change.fromStateId}" here.` };
  if (change.toStateId === undefined) return { ok: true, copies: [] };
  /*
   * Here rather than only in the dialog's target list: this is the function that writes, and a
   * caller that forgot to filter would otherwise get a preset that jumps to itself on every copy.
   * On the hardware that's a reload, which already has its own spelling.
   */
  if (change.toStateId === change.fromStateId) {
    return {
      ok: false,
      error:
        "A route can't lead to the state it leaves from. To reload the preset, give the step Preset Select → Current.",
    };
  }

  const to = machine.states.find((s) => s.id === change.toStateId);
  const toMembers = machine.members[change.toStateId] ?? [];
  if (!to || toMembers.length === 0) return { ok: false, error: `There's no state "${change.toStateId}" here.` };

  /*
   * A route that's already there — kept on its switch or moved to another — is the same way in, so
   * it costs nothing: the copy it leads to exists because this route is what made it. Only a new
   * destination is a new way in, and that gets priced below like any other.
   */
  if (existingEntry(config, change, members, toMembers)) return { ok: true, copies: [] };

  const targetWayBack = wayBack(config, machine, to.id);
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
  const sharedBy = settled ? [] : presetEntrants(config, toMembers[0]!, graph);
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
