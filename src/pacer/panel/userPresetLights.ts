import { indicatorForLedNum, type IndicatorSpec, type SwitchSpec } from "../hardware";
import { ControlMode, STEPS_PER_CONTROL } from "../protocol/constants";
import type { PacerHue } from "../protocol/ledColors";
import type { LedConfig, SwitchControl } from "../protocol/types";
import type { ControlRuntimeState } from "../simulator/types";
import { defaultLedHue } from "./defaultLedColors";
import { stepLight, type StepLight } from "./engagement";
import { lightFromColorCode, type SwitchLights } from "./lights";
import type { LightState } from "./types";

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

const MODE_INDICATOR_LIT: LightState = { brightness: "bright", flashing: false, color: { kind: "lightBlue" } };
const DARK_LIGHT: LightState = { brightness: "off", flashing: false, color: { kind: "unspecified" } };

function renderStepLight(
  indicator: IndicatorSpec,
  light: StepLight,
  led: LedConfig,
  defaultHue: PacerHue | undefined,
): LightState {
  switch (light.kind) {
    case "on":
      return lightFromColorCode(indicator, led.activeColor, true, defaultHue);
    case "off":
      return lightFromColorCode(indicator, led.inactiveColor, false, defaultHue);
    case "dark":
      return DARK_LIGHT;
    case "modeIndicator":
      return light.lit ? MODE_INDICATOR_LIT : DARK_LIGHT;
  }
}

/** Per-preset facts the light rules need beyond one control's own config and runtime state. */
export interface UserPresetContext {
  activePresetIndex: number;
  /** This switch sent the preset's most recent Program Change. */
  sentLastProgramChange: boolean;
}

/**
 * Lights a user preset's config drives on one switch. Each showing step's LED config lights the
 * indicator its LED num selects (see `indicatorForLedNum`). What the light shows (On color, Off
 * color, dark, or the mode indicator) comes from `stepLight`, the firmware LED model. If two steps target the same indicator, the lower-numbered step wins
 * (assumption). LED `midiController` (LED driven by incoming MIDI) isn't simulated, since there's
 * no MIDI input yet.
 */
export function userPresetLights(
  spec: SwitchSpec,
  control: SwitchControl | undefined,
  runtime: ControlRuntimeState | undefined,
  context: UserPresetContext,
): SwitchLights {
  const lights: SwitchLights = {};
  if (!control) return lights;
  for (const n of showingSteps(control, runtime)) {
    const led = control.led[n];
    const step = control.steps[n];
    if (!led || !step) continue;
    const indicator = indicatorForLedNum(spec, led.position ?? 0);
    if (!indicator || lights[indicator.id]) continue;
    const light = stepLight(step, {
      held: runtime?.pressed ?? false,
      toggleOn: runtime?.toggleState[n] === true,
      sentLastProgramChange: context.sentLastProgramChange,
      current: { kind: "user", index: context.activePresetIndex },
    });
    lights[indicator.id] = renderStepLight(indicator, light, led, defaultLedHue(step.msgType));
  }
  return lights;
}
