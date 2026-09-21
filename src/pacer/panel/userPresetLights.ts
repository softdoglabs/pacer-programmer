import { indicatorForLedNum, type SwitchSpec } from "../hardware";
import { ControlMode, STEPS_PER_CONTROL } from "../protocol/constants";
import type { SwitchControl } from "../protocol/types";
import type { ControlRuntimeState } from "../simulator/types";
import { defaultLedColor } from "./defaultLedColors";
import { isStepEngaged } from "./engagement";
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

/** Per-preset facts the light rules need beyond one control's own config and runtime state. */
export interface UserPresetContext {
  activePresetIndex: number;
  /** This switch sent the preset's most recent Program Change. */
  sentLastProgramChange: boolean;
}

/**
 * Lights a user preset's config drives on one switch. Each showing step's LED config lights the
 * indicator its LED num selects (see `indicatorForLedNum`). It shows the On (active) color while
 * the step is engaged and the Off (inactive) color otherwise; see `isStepEngaged` for the
 * firmware LED model. If two steps target the same indicator, the lower-numbered step wins
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
    const engaged = isStepEngaged(step, {
      held: runtime?.pressed ?? false,
      toggleOn: runtime?.toggleState[n] === true,
      sentLastProgramChange: context.sentLastProgramChange,
      current: { kind: "user", index: context.activePresetIndex },
    });
    lights[indicator.id] = lightFromColorCode(
      indicator,
      engaged ? led.activeColor : led.inactiveColor,
      engaged,
      defaultLedColor(step.msgType),
    );
  }
  return lights;
}
