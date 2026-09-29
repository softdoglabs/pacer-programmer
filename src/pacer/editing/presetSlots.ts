import {
  EXPRESSION_PEDAL_CONTROL_IDS,
  ExpressionMessageType,
  PresetMidiMessageType,
  SwitchMessageType,
} from "../protocol/constants";
import type { PacerConfig, Preset, SwitchControl } from "../protocol/types";

/*
 * Whole presets: emptying one, and copying one into another slot.
 *
 * The Pacer has 24 slots and no notion of a free one — every preset holds whatever it was last
 * given, factory contents included. But a state that comes back needs a preset per place it can be
 * entered from (see `pacer/authoring`), so a design grows by taking slots, and something has to say
 * which ones may be taken.
 *
 * **What makes a preset spare is that nothing in it does anything**, not what it's called. A name
 * is five characters on a 14-segment display: handy for spotting a slot you've freed, on the device
 * as well as here, and no basis at all for overwriting somebody's work. So clearing names it
 * "EMPTY" as a label, and every judgement is made on the contents.
 *
 * Clearing sets what's there to Off rather than removing it. A dump holds all six steps of every
 * control and all sixteen preset messages — the unused ones are Off already — so writing Off over
 * what's present is exactly what it takes to leave nothing behind on the hardware. Deleting the
 * fields instead would send nothing for them, and the device would keep what it had.
 */

/** What clearing calls a preset, so a freed slot is recognisable on the device's own display. */
export const SPARE_PRESET_NAME = "EMPTY";

function isSwitch(controlId: number): boolean {
  return !EXPRESSION_PEDAL_CONTROL_IDS.includes(controlId);
}

/** Nothing happens when this step's turn comes. */
function doesNothing(controlId: number, step: { msgType: number; active: boolean }): boolean {
  if (!step.active) return true;
  if (step.msgType === (isSwitch(controlId) ? SwitchMessageType.Off : ExpressionMessageType.Off)) return true;
  // Plain next/previous stepping: it holds nothing of yours, and a preset left with only the
  // stepping C and D carry is one somebody has already emptied.
  return isSwitch(controlId) && step.msgType === SwitchMessageType.PresetIncDec;
}

/** A preset with nothing of anyone's in it, so a new copy of a state may take its slot. */
export function isSparePreset(preset: Preset | undefined): boolean {
  if (!preset) return true; // never in the dump at all
  for (const [controlId, control] of Object.entries(preset.controls)) {
    for (const step of Object.values(control?.steps ?? {})) {
      if (step && !doesNothing(Number(controlId), step)) return false;
    }
  }
  return Object.values(preset.midiSettings).every((m) => !m || m.msgType === PresetMidiMessageType.Off);
}

/** The same control with every step it holds set to Off. */
function emptied(controlId: number, control: SwitchControl): SwitchControl {
  const off = isSwitch(controlId) ? SwitchMessageType.Off : ExpressionMessageType.Off;
  const steps: SwitchControl["steps"] = {};
  for (const [n, step] of Object.entries(control.steps)) {
    if (!step) continue;
    // Step 1 keeps its active flag: the User Guide has every control using at least one step,
    // and the hardware's own menu won't turn it off. Off does nothing anyway.
    steps[Number(n)] = { ...step, msgType: off, data: [0, 0, 0], active: Number(n) === 1 && step.active };
  }
  return { ...control, steps };
}

/**
 * Empties one switch: every step it holds set to Off, the LED colors left alone.
 *
 * What it's for is making room. A switch with all six steps spoken for, or whose first step
 * already jumps somewhere, has nowhere a route could go — and on a real device that's most of
 * them, since the factory set puts Track on A and Transport on B of every preset. Clearing it
 * says "this switch does this now instead", which is a thing to be asked for rather than done
 * quietly (see `pacer/authoring`).
 */
export function clearControl(config: PacerConfig, presetIndex: number, controlId: number): PacerConfig {
  const control = config.presets[presetIndex]?.controls[controlId];
  if (!control) return config;
  const preset = config.presets[presetIndex]!;
  return {
    ...config,
    presets: {
      ...config.presets,
      [presetIndex]: { ...preset, controls: { ...preset.controls, [controlId]: emptied(controlId, control) } },
    },
  };
}

/** Empties a preset: every step and preset message it holds set to Off, and named as spare. */
export function clearPreset(config: PacerConfig, presetIndex: number, name = SPARE_PRESET_NAME): PacerConfig {
  const preset = config.presets[presetIndex];
  if (!preset) return config;

  const controls: Preset["controls"] = {};
  for (const [id, control] of Object.entries(preset.controls)) {
    if (control) controls[Number(id)] = emptied(Number(id), control);
  }

  const midiSettings: Preset["midiSettings"] = {};
  for (const [n, setting] of Object.entries(preset.midiSettings)) {
    if (setting) midiSettings[Number(n)] = { ...setting, msgType: PresetMidiMessageType.Off, data: [0, 0, 0] };
  }

  return { ...config, presets: { ...config.presets, [presetIndex]: { ...preset, name, controls, midiSettings } } };
}

/** Copies a preset's whole contents into another slot, keeping that slot's own index. */
export function copyPreset(config: PacerConfig, from: number, to: number): PacerConfig {
  const source = config.presets[from];
  if (!source || from === to) return config;
  return {
    ...config,
    presets: { ...config.presets, [to]: { ...structuredClone(source), index: to } },
  };
}
