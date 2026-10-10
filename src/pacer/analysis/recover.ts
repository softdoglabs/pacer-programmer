import { CURRENT_PRESET_INDEX, SwitchMessageType, presetIndexToLabel } from "../protocol/constants";
import type { PacerConfig, Preset } from "../protocol/types";
import type { EntryTarget, MachineState, MachineTransition, StateMachine } from "./model";
import { presetStates } from "./states";
import { presetEntrants } from "./returns";
import { isPlainStepping, presetTransitions, type TransitionEdge, type TransitionGraph } from "./transitions";

/*
 * Reading a state machine back out of the presets it compiled to. Nothing else is stored, so this
 * is the only thing standing between a design and oblivion — and the reason the compiler may only
 * emit shapes that land here intact.
 *
 * A group of presets that behave alike is a state (see `presetStates`). Its copies differ only in
 * where their jumps lead, and reading those against what enters each copy is reading the state: a
 * switch that leads every copy to the same state is an ordinary transition, one that leads each copy
 * back to the preset that entered it is a return, and anything in between is a table of where it
 * leads from each way in (`byEntry`).
 */

/** One place where the presets say something the model has no way to express. */
export interface RecoveryNote {
  presetIndex: number;
  message: string;
}

export interface RecoveredMachine extends StateMachine {
  /** Which presets each state came from, so a compile can be compared against what's on the device. */
  members: Partial<Record<string, number[]>>;
  /**
   * The presets that lead into each preset — its ways in — leaving out edges that go back to
   * whatever entered the preset they leave, which are returns arriving rather than entrances.
   */
  waysIn: Partial<Record<number, number[]>>;
  notes: RecoveryNote[];
}

/** Everything in a preset's controls except its navigation steps, which belong to transitions. */
function bodyOf(preset: Preset): Preset["controls"] {
  const body: Preset["controls"] = {};
  for (const [controlId, control] of Object.entries(preset.controls)) {
    if (!control) continue;
    const steps: typeof control.steps = {};
    for (const [n, step] of Object.entries(control.steps)) {
      if (!step) continue;
      if (step.msgType === SwitchMessageType.PresetSelect || step.msgType === SwitchMessageType.PresetIncDec) continue;
      steps[Number(n)] = step;
    }
    body[Number(controlId)] = { controlMode: control.controlMode, steps, led: { ...control.led } };
  }
  return body;
}

export function recoverMachine(config: PacerConfig): RecoveredMachine {
  /*
   * The Current slot is left out. It's the device's working copy of whatever preset is loaded —
   * a duplicate of one of the others, not a place you can be sent to — so counting it makes a
   * state look like it has an extra copy whose jumps disagree with the rest.
   */
  const groups = presetStates(config)
    .map((g) => {
      const members = g.members.filter((m) => m !== CURRENT_PRESET_INDEX);
      /*
       * And it doesn't get a say in the name either. A state is named only when all its presets
       * agree, and the working copy lags behind the slot it copies until the next send — so
       * renaming the loaded preset left its state with two names and therefore none.
       */
      const names = members.map((m) => config.presets[m]?.name);
      const name = names.every((n) => n === names[0]) ? names[0] : undefined;
      return { members, ...(name !== undefined ? { name } : {}) };
    })
    .filter((g) => g.members.length > 0);
  const graph = presetTransitions(config);

  /*
   * A state per group, identified by its name — the only identity a dump can carry. A device
   * that wasn't compiled from a machine can repeat one, though: this owner's A1 and A4 are both
   * "PRGM1". Two states sharing an id merge wherever ids are keys, so a node ends up showing
   * another state's routes. Where a name repeats, every state that bears it is qualified by the
   * slot it starts at, rather than the second one alone, so the ids don't depend on order.
   */
  const nameCounts = new Map<string, number>();
  for (const group of groups) {
    const name = group.name?.trim();
    if (name) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  const stateOf = new Map<number, string>();
  const ids = groups.map((group) => {
    const name = group.name?.trim();
    const slot = presetIndexToLabel(group.members[0]!);
    const id = !name ? slot : (nameCounts.get(name) ?? 0) > 1 ? `${name} (${slot})` : name;
    for (const member of group.members) stateOf.set(member, id);
    return id;
  });

  /*
   * Nested returns are read from the inside out. A looper whose tuner returns to it has each looper
   * copy entered twice — once from its origin, once by its tuner copy coming back — so the looper's
   * own way back can't be seen until the tuner's is known: an edge that goes back to whatever
   * entered its preset isn't a way into the preset it lands on. So the reading repeats, setting
   * aside each round's way-back edges, until nothing more is learned. A design nested N deep
   * settles in N rounds; the bound only guards against a configuration that oscillates.
   */
  let back = new Set<TransitionEdge>();
  let reading = readStates(config, graph, groups, ids, stateOf, back);
  for (let round = 0; round < groups.length && reading.back.size !== back.size; round++) {
    back = reading.back;
    reading = readStates(config, graph, groups, ids, stateOf, back);
  }

  const members: RecoveredMachine["members"] = {};
  groups.forEach((group, i) => (members[ids[i]!] = group.members));
  const waysIn: RecoveredMachine["waysIn"] = {};
  for (const group of groups) {
    for (const m of group.members) waysIn[m] = presetEntrants(config, m, graph, reading.back);
  }
  return { states: reading.states, members, waysIn, notes: reading.notes };
}

interface Reading {
  states: MachineState[];
  notes: RecoveryNote[];
  /** Edges that go back to whatever entered the preset they leave: not ways into where they land. */
  back: Set<TransitionEdge>;
}

function readStates(
  config: PacerConfig,
  graph: TransitionGraph,
  groups: { members: number[]; name?: string }[],
  ids: string[],
  stateOf: Map<number, string>,
  backSoFar: ReadonlySet<TransitionEdge>,
): Reading {
  const notes: RecoveryNote[] = [];
  const back = new Set<TransitionEdge>();
  const entrants = (m: number) => presetEntrants(config, m, graph, backSoFar);
  const copiesOf = new Map(groups.map((g, i) => [ids[i]!, g.members.length]));

  const states: MachineState[] = groups.map((group, i) => {
    const id = ids[i]!;
    const first = config.presets[group.members[0]!]!;
    const transitions: MachineTransition[] = [];

    // Transitions are keyed by which control and step carries them, so the copies can be compared.
    const slots = new Set<string>();
    for (const member of group.members) {
      for (const edge of graph.from[member] ?? []) slots.add(`${edge.controlId}:${edge.stepNumber}`);
    }

    for (const slot of [...slots].sort()) {
      const [controlId, stepNumber] = slot.split(":").map(Number) as [number, number];
      const perMember = group.members.map((member) => ({
        member,
        edge: (graph.from[member] ?? []).find((e) => e.controlId === controlId && e.stepNumber === stepNumber),
      }));

      if (perMember.some((p) => !p.edge)) {
        notes.push({
          presetIndex: perMember.find((p) => !p.edge)!.member,
          message: `${presetIndexToLabel(perMember.find((p) => !p.edge)!.member)} is missing a jump its state has elsewhere.`,
        });
        continue;
      }

      const targets = perMember.map((p) => targetIndexOf(p.edge!));
      /*
       * A reload, or a jump to the firmware's Track/Transport presets. Those are real and
       * intentional — the factory set puts them on A and B of every preset — they're just not
       * places in this model, which describes a configuration's own states. Passing over them is
       * correct; noting them would bury the genuine problems in 50 lines of noise.
       */
      if (targets.some((t) => t === undefined)) continue;

      // Worth being able to put aside when reading a map: it's what C and D do on every preset.
      const stepping = perMember.every((p) => isPlainStepping(config, p.edge!));
      const targetStates = new Set(targets.map((t) => stateOf.get(t!)));
      const fixed = (to: string | undefined) => {
        if (to !== undefined) {
          transitions.push({
            controlId,
            stepNumber,
            to: { kind: "state", id: to },
            ...(stepping ? { viaStepping: true } : {}),
          });
        }
      };

      /*
       * With one copy, a switch leads to one place, whatever entered it. "Goes back to whatever
       * entered it" and "goes to A1" are then the same preset, and nothing in the dump says which was
       * meant — so it reads as the jump it literally is. A second copy is what settles it.
       */
      if (group.members.length === 1) {
        fixed([...targetStates][0]);
        continue;
      }
      /*
       * Copies of a state sit in different slots, so their neighbour walks lead to different
       * presets — B6 from one, D4 from another. That's where a copy happens to live, not something
       * the state does, so there's nothing to draw and nothing wrong.
       */
      if (stepping) {
        if (targetStates.size === 1) fixed([...targetStates][0]);
        continue;
      }

      /*
       * Every copy leading to one state of one preset is an ordinary jump, even where that preset
       * is also the way into a copy: LOOPR's B going to MAIN0 is "always MAIN0", not "back, when
       * entered from MAIN0". A state of several copies is different — "to MAIN" doesn't say which
       * copy — so a jump to one is only fixed when it doesn't go back to the copy that entered.
       */
      const onlyTarget = targetStates.size === 1 ? [...targetStates][0] : undefined;
      if (onlyTarget !== undefined && (copiesOf.get(onlyTarget) ?? 0) === 1) {
        fixed(onlyTarget);
        continue;
      }

      /*
       * Where the switch leads from each way in. A copy entered from MAIN0 that leads to MAIN0 goes
       * back; one entered from MAIN3 that leads to MAIN0 goes to MAIN0. The copies of a state differ
       * only in these rows, so reading them is reading the state.
       */
      const rows = new Map<string, EntryTarget>();
      let disagree = false;
      for (const [k, { member, edge }] of perMember.entries()) {
        const t = targets[k]!;
        const ways = entrants(member);
        for (const e of ways) {
          const from = stateOf.get(e);
          if (from === undefined) continue;
          const to: EntryTarget = t === e ? { kind: "return" } : { kind: "state", id: stateOf.get(t)! };
          const was = rows.get(from);
          if (was && JSON.stringify(was) !== JSON.stringify(to)) disagree = true;
          rows.set(from, to);
        }
        // Back from every way into this copy: an arrival that isn't a way into where it lands.
        if (ways.length > 0 && ways.every((e) => e === t)) back.add(edge!);
      }
      if (disagree) {
        notes.push({
          presetIndex: group.members[0]!,
          message: `The copies of "${id}" lead to different places from the same way in, which no state can mean.`,
        });
        continue;
      }

      const routes = [...rows.entries()].map(([from, to]) => ({ from, to }));
      if (routes.length === 0 || routes.every((r) => r.to.kind === "state")) {
        // Every way in leads the same place (or nothing enters any copy): an ordinary jump.
        const to = new Set(routes.map((r) => (r.to.kind === "state" ? r.to.id : "")));
        if (routes.length > 0 ? to.size === 1 : targetStates.size === 1) {
          fixed(routes.length > 0 ? [...to][0] : [...targetStates][0]);
          continue;
        }
      }
      if (routes.every((r) => r.to.kind === "return")) {
        transitions.push({ controlId, stepNumber, to: { kind: "return" } });
        continue;
      }
      transitions.push({
        controlId,
        stepNumber,
        to: { kind: "byEntry", routes: routes.sort((a, b) => a.from.localeCompare(b.from)) },
      });
    }

    return { id, ...(group.name !== undefined ? { name: group.name } : {}), body: bodyOf(first), transitions };
  });

  return { states, notes, back };
}

function targetIndexOf(edge: TransitionEdge): number | undefined {
  return edge.target.kind === "preset" ? edge.target.index : undefined;
}
