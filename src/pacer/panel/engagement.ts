import type { SpecialPresetName } from "../simulator/types";
import { SwitchMessageType, presetSelectTargetToIndex } from "../protocol/constants";
import type { Step } from "../protocol/types";

/** Which "preset" the switches currently belong to: a user preset, or a built-in DAW preset. */
export type CurrentPreset = { kind: "user"; index: number } | { kind: "special"; preset: SpecialPresetName };

export interface StepContext {
  /** The switch is physically held. */
  held: boolean;
  /** The step's persistent toggle bit (CC/Note Toggle). */
  toggleOn: boolean;
  /** This switch sent the current preset's most recent Program Change. */
  sentLastProgramChange: boolean;
  current: CurrentPreset;
}

function presetSelectTargetIsCurrent(target: number, current: CurrentPreset): boolean {
  if (target === 1) return current.kind === "special" && current.preset === "track";
  if (target === 2) return current.kind === "special" && current.preset === "transport";
  const index = presetSelectTargetToIndex(target);
  return index !== undefined && current.kind === "user" && current.index === index;
}

/**
 * The firmware's LED model, as reconstructed from the manual and hardware observations: a step's
 * light shows whether what the step *selects* is currently selected ("engaged"). It shows the On
 * color when engaged and the Off color otherwise.
 * - CC/Note Toggle: the toggle is on. Factory bank B's CC toggles rest dim blue.
 * - Program Change (Program & Bank / Program Step): this switch sent the preset's most recent
 *   Program Change. User Guide on A1-A4: "the LED switch for the last sent message is fully
 *   illuminated with other switches dimmed".
 * - Preset Select: its target is the current preset. That includes the built-in Track /
 *   Transport presets, which is how the mode indicators light (observed: the switch for the
 *   selected mode is lit).
 * - Preset Inc/Dec: never, since it selects nothing. Observed: C/D don't light when pressed.
 * - Everything else (momentary: CC Trigger/Step, Note, NRPN, MMC, Relay, Step Select): while
 *   held. An assumption; not yet observed.
 */
export function isStepEngaged(step: Step, ctx: StepContext): boolean {
  switch (step.msgType) {
    case SwitchMessageType.CcToggle:
    case SwitchMessageType.NoteToggle:
      return ctx.toggleOn;
    case SwitchMessageType.ProgramAndBank:
    case SwitchMessageType.ProgramStep:
      return ctx.sentLastProgramChange;
    case SwitchMessageType.PresetSelect:
      return presetSelectTargetIsCurrent(step.data[0], ctx.current);
    case SwitchMessageType.PresetIncDec:
      return false;
    default:
      return ctx.held;
  }
}
