import { ControlMode, STEPS_PER_CONTROL } from "../protocol/constants";
import type { BoardState } from "./types";

export interface LedColor {
  name: string;
  /** CSS color for on-screen rendering. The hex values are our own approximations, not hardware-measured. */
  css: string;
}

/**
 * Pacer LED color codes (0x01-0x18: 12 hues, each with a bright "A" and dim "B" variant).
 * The code -> name mapping is a documented protocol fact from the reference project's
 * `COLORS` table, and it matches the factory "COLOR" preset, which pairs each bright code
 * (active) with its dim neighbor (inactive).
 */
const HUES: [name: string, css: string][] = [
  ["Pink", "#ff8fb1"],
  ["Red", "#ff3b30"],
  ["Orange", "#ff8c00"],
  ["Amber", "#ffbf00"],
  ["Yellow", "#ffe600"],
  ["Lime", "#7dff3a"],
  ["Green", "#1fbf4a"],
  ["Teal", "#18b7a8"],
  ["Blue", "#2f6bff"],
  ["Lavender", "#c9b8ff"],
  ["Purple", "#a23dff"],
  ["White", "#f4f4f5"],
];

export const LED_COLORS: Partial<Record<number, LedColor>> = { 0x00: { name: "Off", css: "transparent" } };
HUES.forEach(([name, css], i) => {
  LED_COLORS[1 + i * 2] = { name: `${i + 1}A ${name}`, css };
  LED_COLORS[2 + i * 2] = { name: `${i + 1}B Dim ${name}`, css: `color-mix(in srgb, ${css} 40%, black)` };
});

/**
 * 0x7F is what the factory dump uses on nearly every LED entry. Its meaning isn't documented
 * anywhere we've found; presumably "firmware default behavior". Rendered as a neutral color
 * rather than guessed at.
 */
export const LED_COLOR_DEFAULT = 0x7f;

export function ledColor(code: number): LedColor {
  if (code === LED_COLOR_DEFAULT) return { name: "Default (0x7F, undocumented)", css: "#8a8f98" };
  return LED_COLORS[code] ?? { name: `Unknown (0x${code.toString(16)})`, css: "#8a8f98" };
}

export interface ControlLedState {
  /** Which step's LED config is currently shown. */
  stepNumber: number;
  lit: boolean;
  /** Undefined when the control has no LED entry for that step (e.g. external footswitches, expression pedals). */
  colorCode?: number;
}

function previousStep(step: number): number {
  return step <= 1 ? STEPS_PER_CONTROL : step - 1;
}

/**
 * The LED state the simulator shows for a control. Assumptions (not verified against hardware):
 * - The LED reflects one "current" step: in Sequence mode, the step that most recently fired
 *   (step 1 before any press); otherwise step 1.
 * - It shows `activeColor` while the control is held or while that step's toggle is on, and
 *   `inactiveColor` otherwise.
 * - LED `midiController` (LED driven by incoming MIDI) isn't simulated: there's no MIDI input yet.
 */
export function getControlLedState(board: BoardState, controlId: number): ControlLedState | undefined {
  const control = board.config.presets[board.activePresetIndex]?.controls[controlId];
  if (!control) return undefined;

  const runtime = board.controls[controlId];
  let stepNumber = 1;
  if (control.controlMode === ControlMode.Sequence && runtime) {
    stepNumber = runtime.pendingSequenceStep ?? previousStep(runtime.sequencePointer);
  }

  const lit = (runtime?.pressed ?? false) || runtime?.toggleState[stepNumber] === true;
  const led = control.led[stepNumber];
  return { stepNumber, lit, colorCode: lit ? led?.activeColor : led?.inactiveColor };
}
