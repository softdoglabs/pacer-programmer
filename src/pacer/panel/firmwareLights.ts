import type { DeviceMode, SpecialPresetDefinition } from "../device";
import { bankSelectedBy, numberSelectedBy, type SwitchSpec } from "../hardware";
import { userPresetIndex } from "../protocol/constants";
import { inkOrColor, type SwitchLights } from "./lights";
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
 * - A-D: the pending bank is solid bright and the others are off. Assumed; not observed.
 * Legends keep their idle state.
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
 * Lights inside a built-in DAW preset (Track / Transport): the preset's printed legend row lights
 * in its ink on every switch that has one (see `SpecialPresetDefinition.litLegendRow`). Bars
 * stay off, since their DAW-mode behavior isn't documented.
 */
export function dawPresetLights(spec: SwitchSpec, preset: SpecialPresetDefinition): SwitchLights {
  const row = spec.indicators.find((i) => i.id === preset.litLegendRow);
  if (!row || row.color.kind !== "fixed") return {};
  return { [row.id]: { brightness: "bright", flashing: false, color: inkOrColor(row, { kind: "unspecified" }) } };
}

/**
 * [Preset]'s own bar. It flashes bright red while preset select is active (observed on
 * hardware). It's solid royal blue in Track/Transport as a "tap to return" cue (assumption),
 * and off on a user preset.
 */
export function presetButtonBar(mode: DeviceMode): LightState {
  switch (mode) {
    case "presetSelect":
      return { brightness: "bright", flashing: true, color: { kind: "hue", hue: "red" } };
    case "track":
    case "transport":
      return ROYAL_BLUE_BRIGHT;
    case "user":
      return BAR_OFF;
  }
}
