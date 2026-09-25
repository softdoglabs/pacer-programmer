import {
  FIRST_USER_PRESET_INDEX,
  PRESET_NAME_LENGTH,
  LAST_USER_PRESET_INDEX,
  SwitchMessageType,
  presetIndexToPresetSelectTarget,
} from "../protocol/constants";
import { createEmptyPacerConfig, getOrCreateControl, getOrCreatePreset } from "../protocol/types";
import { whatWontSurvive } from "./verify";
import type { PacerConfig, Preset, Step } from "../protocol/types";

/*
 * The state machine a user actually means, and how it becomes presets.
 *
 * The Pacer can't remember where it came from, so "the looper is running" can't be one preset: it
 * has to be one per place it can be entered from, each hard-coding its own way back. That return
 * address is the whole cost of the missing feature, and expanding it is this compiler's job.
 *
 * Nothing here is persisted. A machine survives by being compiled to presets and read back out of
 * them (see `recoverMachine`), so the compiler must only ever emit shapes the recovery can name —
 * whatever is authorable has to be recoverable.
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
   * Set by the recovery, never by an author: this is a Preset Inc/Dec that does nothing but move
   * to the neighbouring preset. Every factory preset has two, so a map that draws them all is
   * mostly furniture — see `ui/map`. The compiler ignores it; it only ever emits Preset Select.
   */
  viaStepping?: boolean;
}

export interface MachineState {
  id: string;
  /** Stored as the preset name on every copy, so the recovery can name the state again. */
  name?: string;
  /**
   * What the state's controls do, exactly as a preset holds them — minus navigation, which the
   * transitions own. A step here that navigates is rejected: it would be a second, invisible
   * transition the model doesn't know about.
   */
  body: Preset["controls"];
  transitions: MachineTransition[];
}

export interface StateMachine {
  states: MachineState[];
}

/** One compiled copy of a state: the state, plus the instance it goes back to. */
interface Instance {
  stateId: string;
  /** Key of the instance a `return` leads to, or undefined for a state that never returns. */
  returnTo?: string;
}

const instanceKey = (i: Instance): string => `${i.stateId}<${i.returnTo ?? ""}`;

export type CompileResult =
  | { ok: true; config: PacerConfig; slots: { key: string; stateId: string; presetIndex: number }[] }
  | { ok: false; error: string; needed?: number };

const SLOTS = LAST_USER_PRESET_INDEX - FIRST_USER_PRESET_INDEX + 1;

function returns(state: MachineState): boolean {
  return state.transitions.some((t) => t.to.kind === "return");
}

function navigates(step: Step | undefined): boolean {
  return (
    step !== undefined &&
    (step.msgType === SwitchMessageType.PresetSelect || step.msgType === SwitchMessageType.PresetIncDec)
  );
}

/**
 * Expands a machine into the presets the hardware needs, or says why it can't.
 *
 * A state that never returns needs one copy however many places enter it: its behaviour doesn't
 * depend on where you came from. A state that returns needs one copy per distinct continuation,
 * and a state entered *from* such a copy multiplies in turn — which is how a design that reads as
 * three states can cost more slots than the device has.
 */
export function compileMachine(machine: StateMachine): CompileResult {
  const byId = new Map(machine.states.map((s) => [s.id, s]));
  /*
   * Names need only fit the display. They are labels, not identities: what makes two states the
   * same is behaving alike apart from where their navigation leads, which is what the recovery
   * groups on, so two states may share a name as long as they do something different.
   */
  for (const state of machine.states) {
    const name = state.name?.trim();
    if (name !== undefined && name.length > PRESET_NAME_LENGTH) {
      return { ok: false, error: `"${name}" is longer than the ${PRESET_NAME_LENGTH} characters a preset name holds.` };
    }
  }
  for (const state of machine.states) {
    for (const control of Object.values(state.body)) {
      for (const step of Object.values(control?.steps ?? {})) {
        if (navigates(step)) {
          return { ok: false, error: `State "${state.id}" has a navigation step in its body; use a transition.` };
        }
      }
    }
    for (const t of state.transitions) {
      if (t.to.kind === "state" && !byId.has(t.to.id)) {
        return { ok: false, error: `State "${state.id}" leads to "${t.to.id}", which doesn't exist.` };
      }
    }
  }

  // Seeds: states that never return don't need a continuation, so they exist once and are where
  // a design begins. A state that returns is only ever reached by being entered.
  const instances = new Map<string, Instance>();
  const queue: Instance[] = [];
  const add = (instance: Instance): string => {
    const key = instanceKey(instance);
    if (!instances.has(key)) {
      instances.set(key, instance);
      queue.push(instance);
    }
    return key;
  };
  for (const state of machine.states) if (!returns(state)) add({ stateId: state.id });

  // Where each instance's transitions lead, once the continuations are known.
  const resolved = new Map<string, { transition: MachineTransition; targetKey: string }[]>();
  while (queue.length > 0) {
    const instance = queue.shift()!;
    const key = instanceKey(instance);
    const state = byId.get(instance.stateId)!;
    const edges: { transition: MachineTransition; targetKey: string }[] = [];
    for (const transition of state.transitions) {
      if (transition.to.kind === "return") {
        if (instance.returnTo === undefined) {
          return { ok: false, error: `State "${state.id}" returns, but nothing enters it.` };
        }
        edges.push({ transition, targetKey: instance.returnTo });
        continue;
      }
      const target = byId.get(transition.to.id)!;
      // Only a returning state carries a continuation; giving one to a state that never returns
      // would duplicate it for nothing.
      edges.push({ transition, targetKey: add({ stateId: target.id, returnTo: returns(target) ? key : undefined }) });
    }
    resolved.set(key, edges);
    if (instances.size > SLOTS) {
      return { ok: false, error: `This design needs more than the Pacer's ${SLOTS} presets.`, needed: instances.size };
    }
  }

  if (instances.size === 0) return { ok: false, error: "A machine needs at least one state that doesn't return." };

  // Deterministic slots, so compiling the same machine twice puts everything in the same place.
  const keys = [...instances.keys()];
  const slotOf = new Map(keys.map((key, i) => [key, FIRST_USER_PRESET_INDEX + i]));

  const config = createEmptyPacerConfig();
  for (const key of keys) {
    const instance = instances.get(key)!;
    const state = byId.get(instance.stateId)!;
    const preset = getOrCreatePreset(config, slotOf.get(key)!);
    if (state.name !== undefined) preset.name = state.name;
    for (const [controlId, control] of Object.entries(state.body)) {
      if (!control) continue;
      const copy = getOrCreateControl(preset, Number(controlId));
      copy.controlMode = control.controlMode;
      for (const [n, step] of Object.entries(control.steps)) if (step) copy.steps[Number(n)] = { ...step };
      for (const [n, led] of Object.entries(control.led)) if (led) copy.led[Number(n)] = { ...led };
    }
    for (const { transition, targetKey } of resolved.get(key) ?? []) {
      getOrCreateControl(preset, transition.controlId).steps[transition.stepNumber] = {
        channel: 0,
        msgType: SwitchMessageType.PresetSelect,
        data: [presetIndexToPresetSelectTarget(slotOf.get(targetKey)!), 0, 0],
        active: true,
      };
    }
  }

  const compiledSlots = keys.map((key) => ({
    key,
    stateId: instances.get(key)!.stateId,
    presetIndex: slotOf.get(key)!,
  }));

  /*
   * The invariant, checked rather than assumed: read the machine back out of the presets just
   * written and refuse if it isn't the same one. Hand-derived rules about what survives are
   * guesses; this is the property itself.
   */
  const lost = whatWontSurvive(machine, config, compiledSlots);
  if (lost) return { ok: false, error: lost };

  return { ok: true, config, slots: compiledSlots };
}
