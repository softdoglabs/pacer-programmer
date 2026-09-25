import { SwitchMessageType, presetIndexToLabel } from "../protocol/constants";
import type { PacerConfig, Preset } from "../protocol/types";
import type { MachineState, MachineTransition, StateMachine } from "./machine";
import { presetStates } from "./states";
import { presetTransitions, type TransitionEdge } from "./transitions";

/*
 * Reading a state machine back out of the presets it compiled to. Nothing else is stored, so this
 * is the only thing standing between a design and oblivion — and the reason the compiler may only
 * emit shapes that land here intact.
 *
 * A group of presets that behave alike is a state (see `presetStates`). What distinguishes a
 * *return* from an ordinary jump is where each copy points: a return leads each copy back to the
 * preset that entered it, while a fixed transition leads every copy to the same state.
 */

/** One place where the presets say something the model has no way to express. */
export interface RecoveryNote {
  presetIndex: number;
  message: string;
}

export interface RecoveredMachine extends StateMachine {
  /** Which presets each state came from, so a compile can be compared against what's on the device. */
  members: Partial<Record<string, number[]>>;
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
  const groups = presetStates(config).filter((g) => g.members.every((m) => config.presets[m] !== undefined));
  const graph = presetTransitions(config);
  const notes: RecoveryNote[] = [];

  // A state per group, named for the slot its first member sits in when the presets don't agree
  // on a name — an id has to be stable, and the dump has nowhere else to keep one.
  const stateOf = new Map<number, string>();
  const ids = groups.map((group) => {
    const id = group.name?.trim() || presetIndexToLabel(group.members[0]!);
    for (const member of group.members) stateOf.set(member, id);
    return id;
  });

  /** The single preset that enters `member`, if exactly one does — a return needs somewhere to go back to. */
  const soleEntrant = (member: number): number | undefined => {
    const entrants = new Set((graph.into[member] ?? []).map((e) => e.from).filter((from) => from !== member));
    return entrants.size === 1 ? [...entrants][0] : undefined;
  };

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
      if (targets.some((t) => t === undefined)) {
        notes.push({
          presetIndex: group.members[0]!,
          message: `A jump leads somewhere the model can't name (a reload, or a DAW preset).`,
        });
        continue;
      }

      // Every copy going back to whatever entered it is a return; every copy going to the same
      // state is a fixed transition. With one copy the two are indistinguishable — the presets
      // simply don't record which was meant — so it reads as the jump it literally is.
      const isReturn = group.members.length > 1 && perMember.every((p, n) => targets[n] === soleEntrant(p.member));
      if (isReturn) {
        transitions.push({ controlId, stepNumber, to: { kind: "return" } });
        continue;
      }

      const targetStates = new Set(targets.map((t) => stateOf.get(t!)));
      if (targetStates.size === 1) {
        const [to] = targetStates;
        if (to !== undefined) transitions.push({ controlId, stepNumber, to: { kind: "state", id: to } });
        continue;
      }
      notes.push({
        presetIndex: group.members[0]!,
        message: `The copies of "${id}" lead to different states from the same switch, which no single state can mean.`,
      });
    }

    return { id, ...(group.name !== undefined ? { name: group.name } : {}), body: bodyOf(first), transitions };
  });

  const members: RecoveredMachine["members"] = {};
  groups.forEach((group, i) => (members[ids[i]!] = group.members));
  return { states, members, notes };
}

function targetIndexOf(edge: TransitionEdge): number | undefined {
  return edge.target.kind === "preset" ? edge.target.index : undefined;
}
