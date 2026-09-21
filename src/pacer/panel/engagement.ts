import type { SpecialPresetName } from "../simulator/types";
import { SwitchMessageType } from "../protocol/constants";
import type { Step } from "../protocol/types";

/** Which "preset" the switches currently belong to: a user preset, or a built-in DAW preset. */
export type CurrentPreset = { kind: "user"; index: number } | { kind: "special"; preset: SpecialPresetName };

export interface StepContext {
  /** The switch is physically held. */
  held: boolean;
  /**
   * Whether the step's MIDI is in its On state per the device's remembered values
   * (`stepValueOn`), or undefined for steps whose light doesn't follow a remembered value.
   */
  valueOn: boolean | undefined;
  current: CurrentPreset;
}

/**
 * What a step's light shows:
 * - "on" / "off": the step's configured On / Off color.
 * - "dark": the light isn't used.
 * - "modeIndicator": the firmware's selected-mode light (lit light blue while `lit`), not the
 *   step's colors.
 */
export type StepLight = { kind: "on" } | { kind: "off" } | { kind: "dark" } | { kind: "modeIndicator"; lit: boolean };

const ON: StepLight = { kind: "on" };
const OFF: StepLight = { kind: "off" };
const DARK: StepLight = { kind: "dark" };

/**
 * The firmware's LED model, reconstructed from the manual and hardware observations.
 *
 * Steps that send MIDI have a value state. The User Guide calls the colors "On/maximum value
 * state" and "Off/minimum value state". The light shows On or Off by the device's remembered
 * MIDI values (midiState.ts), which persist across preset changes (observed: a PC switch sent on
 * A1 is still bright after visiting another preset and coming back):
 * - CC Toggle / CC Trigger: the CC holds the step's On / press value. Factory bank B's CC
 *   toggles rest dim blue; a CC Trigger with Orange/Dim Orange rests dim orange (observed).
 * - Note / Note Toggle: the note is sounding.
 * - Program & Bank: the channel's current program is the step's. User Guide on A1-A4: "the LED
 *   switch for the last sent message is fully illuminated with other switches dimmed".
 * - Other MIDI types (CC/Program Step, NRPN, MMC, Relay, Step Select): On while held. Assumed.
 *
 * Preset navigation has no value state; the firmware gives each kind a fixed light role:
 * - Preset Select to a user preset: On color, steadily. Observed: A set to Preset Select with
 *   White/Dim White is bright white on both A1 (targeting C1) and C1 (targeting A1). Whether it
 *   differs when the target is the current preset is unknown.
 * - Preset Select to Track/Transport: a mode indicator, lit light blue in that mode and dark
 *   otherwise. Observed with factory A/B.
 * - Preset Inc/Dec: dark, even when pressed and even with explicit colors. Observed: factory
 *   C/D (Default colors) and C/D on a user preset with White/Dim White.
 */
export function stepLight(step: Step, ctx: StepContext): StepLight {
  switch (step.msgType) {
    case SwitchMessageType.PresetSelect: {
      const target = step.data[0];
      if (target === 1 || target === 2) {
        const mode = target === 1 ? "track" : "transport";
        return { kind: "modeIndicator", lit: ctx.current.kind === "special" && ctx.current.preset === mode };
      }
      return target === 0 ? DARK : ON; // 0 = "current" (reload): no observation yet, so left dark
    }
    case SwitchMessageType.PresetIncDec:
      return DARK;
    default:
      if (ctx.valueOn !== undefined) return ctx.valueOn ? ON : OFF;
      return ctx.held ? ON : OFF;
  }
}
