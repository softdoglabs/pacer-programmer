import { indicatorForLedNum, type SwitchSpec } from "../hardware";
import { ControlMode, STEPS_PER_CONTROL, SwitchMessageType } from "../protocol/constants";
import type { SwitchControl } from "../protocol/types";
import type { ControlRuntimeState } from "../simulator/types";
import { defaultLedColor } from "./defaultLedColors";
import { lightFromColorCode, type SwitchLights } from "./lights";

function previousStep(step: number): number {
  return step <= 1 ? STEPS_PER_CONTROL : step - 1;
}

/**
 * Which steps' LED configs are showing. Assumptions (not hardware-verified):
 * - Sequence mode: only the step that most recently fired (step 1 before any press).
 * - External step select: step 1 (cross-control step targeting isn't simulated).
 * - All steps at once: every active step, since they all fire together.
 */
function showingSteps(control: SwitchControl, runtime: ControlRuntimeState | undefined): number[] {
  const mode = control.controlMode ?? ControlMode.AllStepsAtOnce;
  if (mode === ControlMode.Sequence) {
    return [runtime ? (runtime.pendingSequenceStep ?? previousStep(runtime.sequencePointer)) : 1];
  }
  if (mode === ControlMode.ExternalStepSelect) return [1];
  return Object.keys(control.steps)
    .map(Number)
    .filter((n) => control.steps[n]?.active)
    .sort((a, b) => a - b);
}

const PROGRAM_CHANGE_TYPES: readonly number[] = [SwitchMessageType.ProgramAndBank, SwitchMessageType.ProgramStep];

/**
 * Lights a user preset's config drives on one switch. Each showing step's LED config lights the
 * indicator its LED num selects (see `indicatorForLedNum`). A step shows its active (On) color
 * when any of these holds, and its inactive (Off) color otherwise:
 * - the switch is held;
 * - that step's toggle is on;
 * - it's a Program Change step and this switch sent the preset's most recent Program Change.
 *   The User Guide says of factory presets A1-A4: "the LED switch for the last sent message is
 *   fully illuminated with other switches dimmed".
 * If two steps target the same indicator, the lower-numbered step wins (assumption). LED
 * `midiController` (LED driven by incoming MIDI) isn't simulated, since there's no MIDI input yet.
 */
export function userPresetLights(
  spec: SwitchSpec,
  control: SwitchControl | undefined,
  runtime: ControlRuntimeState | undefined,
  sentLastProgramChange = false,
): SwitchLights {
  const lights: SwitchLights = {};
  if (!control) return lights;
  for (const n of showingSteps(control, runtime)) {
    const led = control.led[n];
    if (!led) continue;
    const indicator = indicatorForLedNum(spec, led.position ?? 0);
    if (!indicator || lights[indicator.id]) continue;
    const step = control.steps[n];
    const isProgramChange = step !== undefined && PROGRAM_CHANGE_TYPES.includes(step.msgType);
    const active =
      (runtime?.pressed ?? false) || runtime?.toggleState[n] === true || (isProgramChange && sentLastProgramChange);
    const defaultColor = step ? defaultLedColor(step.msgType) : undefined;
    lights[indicator.id] = lightFromColorCode(
      indicator,
      active ? led.activeColor : led.inactiveColor,
      active,
      defaultColor,
    );
  }
  return lights;
}
