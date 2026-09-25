import { FIRST_USER_PRESET_INDEX, LAST_USER_PRESET_INDEX } from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";
import { compileMachine, type CompileResult, type StateMachine } from "./machine";
import { whatWontSurvive } from "./verify";

/*
 * Putting a machine into a configuration that already exists.
 *
 * `compileMachine` builds the presets a machine needs from nothing, which is the right thing to
 * reason about but not a thing you can send: a real configuration also carries global settings,
 * and usually presets the machine has no opinion about. Those are left exactly as they were —
 * this writes the slots the machine occupies and nothing else, because the surest way to lose
 * somebody's work is to helpfully tidy up around it.
 *
 * The check that matters happens on the *merged* configuration rather than the compiled one. A
 * preset the machine never touched can still reach into it — a switch on an untouched preset that
 * jumps into a state's copy gives that copy a second way in, and a return is only recognisable
 * while every copy has exactly one. The machine would compile, land, and come back as something
 * else, so the merge is verified against what will actually be on the device.
 */

export function applyMachine(config: PacerConfig, machine: StateMachine): CompileResult {
  const compiled = compileMachine(machine);
  if (!compiled.ok) return compiled;

  const presets = { ...config.presets };
  for (const slot of compiled.slots) presets[slot.presetIndex] = compiled.config.presets[slot.presetIndex];
  const merged: PacerConfig = { ...config, presets };

  const lost = whatWontSurvive(machine, merged, compiled.slots);
  if (lost) return { ok: false, error: `${lost} (Something already in this configuration is interfering.)` };

  return { ok: true, config: merged, slots: compiled.slots };
}

/** User slots a machine would occupy, and the ones it would leave alone. */
export function slotUsage(result: CompileResult): { used: number[]; untouched: number[] } {
  const used = result.ok ? result.slots.map((s) => s.presetIndex).sort((a, b) => a - b) : [];
  const untouched: number[] = [];
  for (let i = FIRST_USER_PRESET_INDEX; i <= LAST_USER_PRESET_INDEX; i++) {
    if (!used.includes(i)) untouched.push(i);
  }
  return { used, untouched };
}
