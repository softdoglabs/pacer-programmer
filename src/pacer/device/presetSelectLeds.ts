import { bankSelectedBy, numberSelectedBy } from "../hardware";
import { userPresetIndex } from "../protocol/constants";

export type LedBrightness = "off" | "dim" | "bright";

/** A firmware-driven indicator LED state, independent of any preset's LED color config. */
export interface IndicatorLed {
  brightness: LedBrightness;
  /** Blinks between `brightness` and off. */
  flashing: boolean;
}

/**
 * LEDs while preset select (long-hold [Preset]) is active.
 * - Switches 1-6 flash dim. The exception is the switch for the currently loaded preset, which
 *   is solid bright. It's only shown that way while the pending bank is that preset's bank,
 *   since in another bank that switch would pick a different preset. (That last part is an
 *   assumption; the observed behavior was on the current bank.)
 * - A-D: the pending bank is solid bright and the others are off. Assumption; not described
 *   in the User Guide or confirmed on hardware.
 * Undefined for controls preset select doesn't use.
 */
export function presetSelectLed(
  controlId: number,
  pendingBank: number,
  activePresetIndex: number,
): IndicatorLed | undefined {
  const bank = bankSelectedBy(controlId);
  if (bank !== undefined)
    return bank === pendingBank ? { brightness: "bright", flashing: false } : { brightness: "off", flashing: false };

  const num = numberSelectedBy(controlId);
  if (num !== undefined) {
    const isLoadedPreset = userPresetIndex(pendingBank, num) === activePresetIndex;
    return isLoadedPreset ? { brightness: "bright", flashing: false } : { brightness: "dim", flashing: true };
  }
  return undefined;
}

/**
 * The [Preset] switch's own LED: flashing bright (red, unlike the royal-blue selection LEDs)
 * while preset select is active. In Track/Transport it's shown solid as a "tap to return" cue,
 * which is an assumption; off on a user preset.
 */
export function presetButtonLed(mode: "user" | "presetSelect" | "track" | "transport"): IndicatorLed {
  if (mode === "presetSelect") return { brightness: "bright", flashing: true };
  if (mode === "user") return { brightness: "off", flashing: false };
  return { brightness: "bright", flashing: false };
}
