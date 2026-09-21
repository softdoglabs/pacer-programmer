import { SPECIAL_PRESETS, type DeviceMode } from "../device";
import type { SpecialPresetName } from "../simulator/types";
import { bankSelectedBy, numberSelectedBy, type SwitchSpec } from "../hardware";
import { userPresetIndex } from "../protocol/constants";
import type { SwitchLights } from "./lights";
import type { LightState } from "./types";

const ROYAL_BLUE_BRIGHT: LightState = { brightness: "bright", flashing: false, color: { kind: "royalBlue" } };
const ROYAL_BLUE_DIM_FLASHING: LightState = { brightness: "dim", flashing: true, color: { kind: "royalBlue" } };
const BAR_OFF: LightState = { brightness: "off", flashing: false, color: { kind: "unspecified" } };

/**
 * Bar lights while preset select (long-hold [Preset]) is active. All royal blue (observed on
 * hardware):
 * - 1-6 flash dim, except the switch for the loaded preset, which is solid bright. That
 *   switch only shows solid while the pending bank is the loaded preset's bank; in any other
 *   bank all six flash.
 * - A-D: the current (pending) bank's bar is solid bright and the other three are off.
 * Legends are handled by `legendLights`.
 */
export function presetSelectLights(spec: SwitchSpec, pendingBank: number, activePresetIndex: number): SwitchLights {
  if (spec.controlId === undefined) return {};
  const bank = bankSelectedBy(spec.controlId);
  if (bank !== undefined) return { bottom: bank === pendingBank ? ROYAL_BLUE_BRIGHT : BAR_OFF };
  const num = numberSelectedBy(spec.controlId);
  if (num !== undefined) {
    return {
      bottom: userPresetIndex(pendingBank, num) === activePresetIndex ? ROYAL_BLUE_BRIGHT : ROYAL_BLUE_DIM_FLASHING,
    };
  }
  return {};
}

/**
 * The firmware's "selected mode" indicator color. Observed: the bar of the switch for the
 * current mode (Preset for user presets, A for Track, B for Transport) is bright light blue.
 * Possibly Pacer hue 8 (teal, the documented default for "DAW function"); unconfirmed.
 */
const MODE_INDICATOR: LightState = { brightness: "bright", flashing: false, color: { kind: "lightBlue" } };

/**
 * Bars inside a built-in DAW preset (Track / Transport). Its A/B switches select Track /
 * Transport, and as with any Preset Select to Track/Transport (see `stepLight`), their lights are
 * mode indicators: the one for the current mode is lit light blue (observed). The DAW-function
 * switches' bars stay off, since their behavior isn't documented or observed yet. Legends are
 * handled by `legendLights`.
 */
export function dawPresetLights(spec: SwitchSpec, current: SpecialPresetName): SwitchLights {
  const action = spec.controlId === undefined ? undefined : SPECIAL_PRESETS[current].switches[spec.controlId];
  if (action?.kind !== "goto") return {};
  return { bottom: action.preset === current ? MODE_INDICATOR : BAR_OFF };
}

/**
 * [Preset]'s own bar: the firmware's indicator for "user preset mode" (all observed on hardware).
 * - On a user preset: solid bright light blue, the same as the Track/Transport mode indicators.
 * - In preset select: flashes bright red.
 * - In Track/Transport: off, since that mode's own switch (A/B) is lit instead.
 */
export function presetButtonBar(mode: DeviceMode): LightState {
  switch (mode) {
    case "user":
      return MODE_INDICATOR;
    case "presetSelect":
      return { brightness: "bright", flashing: true, color: { kind: "hue", hue: "red" } };
    case "track":
    case "transport":
      return BAR_OFF;
  }
}
