import { CURRENT_PRESET_INDEX, SwitchMessageType, presetIndexToLabel } from "../protocol/constants";
import type { PacerConfig, Preset } from "../protocol/types";
import type { MachineState, MachineTransition, StateMachine } from "./model";
import { presetStates } from "./states";
import { readsAsReturn } from "./returns";
import { isPlainStepping, presetTransitions, type TransitionEdge } from "./transitions";

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
  const notes: RecoveryNote[] = [];

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

      // Every copy going back to whatever entered it is a return; every copy going to the same
      // state is a fixed transition. With one copy the two are indistinguishable — the presets
      // simply don't record which was meant — so it reads as the jump it literally is.
      if (readsAsReturn(config, group.members, targets, graph)) {
        transitions.push({ controlId, stepNumber, to: { kind: "return" } });
        continue;
      }

      // Worth being able to put aside when reading a map: it's what C and D do on every preset.
      const stepping = perMember.every((p) => isPlainStepping(config, p.edge!));

      const targetStates = new Set(targets.map((t) => stateOf.get(t!)));
      if (targetStates.size === 1) {
        const [to] = targetStates;
        if (to !== undefined) {
          transitions.push({
            controlId,
            stepNumber,
            to: { kind: "state", id: to },
            ...(stepping ? { viaStepping: true } : {}),
          });
        }
        continue;
      }
      /*
       * Copies of a state sit in different slots, so their neighbour walks lead to different
       * presets — B6 from one, D4 from another. That's where a copy happens to live, not something
       * the state does, so there's nothing to draw and nothing wrong. Saying otherwise made every
       * multi-copy state on a real device unreadable, since C and D step on nearly all of them.
       */
      if (stepping) continue;
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
