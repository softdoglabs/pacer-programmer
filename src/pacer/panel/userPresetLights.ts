// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { indicatorForLedNum, type IndicatorSpec, type SwitchSpec } from "../hardware";
import { ControlMode } from "../protocol/constants";
import type { PacerHue } from "../protocol/ledColors";
import type { LedConfig, SwitchControl } from "../protocol/types";
import { wireChannel } from "../protocol/globalSettings";
import { stepValueOn, type MidiState } from "../simulator/midiState";
import type { ControlRuntimeState } from "../simulator/types";
import { defaultLedHue } from "./defaultLedColors";
import { stepLight, type StepLight } from "./engagement";
import { lightFromColorCode, type SwitchLights } from "./lights";
import type { LightState } from "./types";

/**
 * The one step whose LED config is showing: the step that will fire on the next press.
 *
 * Confirmed on hardware (LROWS and SEQ test presets, firmware 1.01.12): a switch lights exactly
 * one light, never several, even when its steps target different rows. In All-at-once mode that
 * is step 1 — a switch with steps on the bar, the icon row and the text row lights only step 1's
 * row, whichever row that is. In Sequence mode it follows the pointer: after firing step 1 the
 * light shows step 2's row and color, and it wraps back to step 1's after the last step.
 *
 * External step select isn't simulated (cross-control targeting is unverified), so it shows step 1.
 */
export function showingStep(control: SwitchControl, runtime: ControlRuntimeState | undefined): number | undefined {
  const mode = control.controlMode ?? ControlMode.AllStepsAtOnce;
  const active = activeSteps(control);
  if (mode === ControlMode.Sequence && runtime)
    return active.includes(runtime.sequencePointer) ? runtime.sequencePointer : active[0];
  return active[0];
}

/** Active step numbers, in firing order. */
export function activeSteps(control: SwitchControl): number[] {
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
  /** The device's remembered MIDI values. */
  midi: MidiState;
  /** The config's global MIDI channel (1-16), to resolve steps set to channel 0. */
  globalChannel: number;
}

/**
 * The light a user preset's config drives on one switch: at most one (see `showingStep`), on the
 * indicator that step's LED num selects (see `indicatorForLedNum`). Which of its two colors shows
 * comes from `stepLight`, the firmware LED model — except where the step's LED has `midiFeedback`
 * on, which takes the light off the switch entirely (see below).
 */
export function userPresetLights(
  spec: SwitchSpec,
  control: SwitchControl | undefined,
  runtime: ControlRuntimeState | undefined,
  context: UserPresetContext,
): SwitchLights {
  const lights: SwitchLights = {};
  if (!control) return lights;
  const n = showingStep(control, runtime);
  if (n !== undefined) {
    const led = control.led[n];
    const step = control.steps[n];
    if (!led || !step) return lights;
    const indicator = indicatorForLedNum(spec, led.position ?? 0);
    if (!indicator) return lights;
    const channel = wireChannel(step.channel, context.globalChannel);
    /*
     * With the LED's MIDI flag on, the firmware drives this light *only* from the step's own CC
     * arriving on USB MIDI — the switch's own presses don't move it (confirmed on 1.01.12: a CC 52
     * toggle with the flag on stayed on its second color through two presses, while the same step
     * with the flag off behaved normally). We have no MIDI input, so nothing is ever received and
     * the light rests on the second color, exactly as the hardware does until its DAW answers.
     */
    const followsIncomingMidi = (led.midiFeedback ?? 0) !== 0;
    const light = stepLight(step, {
      held: followsIncomingMidi ? false : (runtime?.pressed ?? false),
      valueOn: followsIncomingMidi
        ? false
        : channel === undefined
          ? undefined
          : stepValueOn(step, channel, context.midi),
      current: { kind: "user", index: context.activePresetIndex },
    });
    lights[indicator.id] = renderStepLight(indicator, light, led, defaultLedHue(step.msgType));
  }
  return lights;
}
