import type { IndicatorId, IndicatorSpec, SwitchSpec } from "../hardware";
import { decodeLedColor } from "../protocol/ledColors";
import type { LightState } from "./types";

export type SwitchLights = Partial<Record<IndicatorId, LightState>>;

/** A light at a given brightness, colored by its own printed ink if it's a fixed-color legend. */
export function inkOrColor(indicator: IndicatorSpec, fallback: LightState["color"]): LightState["color"] {
  return indicator.color.kind === "fixed" ? { kind: "ink" } : fallback;
}

/**
 * The light a config LED color code produces on an indicator.
 * - Hue codes carry their own brightness (odd = bright "A", even = dim "B"). A fixed-color
 *   legend shows that brightness in its printed ink, since it can't change color (inferred).
 * - The undocumented 0x7F default, or an unknown code, has no brightness of its own: it shows
 *   bright when the step is active and dim otherwise (assumption).
 */
export function lightFromColorCode(indicator: IndicatorSpec, code: number | undefined, active: boolean): LightState {
  const decoded = decodeLedColor(code ?? 0x7f);
  switch (decoded.kind) {
    case "off":
      return { brightness: "off", flashing: false, color: { kind: "unspecified" } };
    case "hue":
      return {
        brightness: decoded.brightness,
        flashing: false,
        color: inkOrColor(indicator, { kind: "hue", hue: decoded.hue }),
      };
    case "default":
    case "unknown":
      return {
        brightness: active ? "bright" : "dim",
        flashing: false,
        color: inkOrColor(indicator, { kind: "unspecified" }),
      };
  }
}

/** Lights that are on with nothing driving them (e.g. back-row legends are always lit). */
export function idleLights(spec: SwitchSpec): SwitchLights {
  const lights: SwitchLights = {};
  for (const indicator of spec.indicators) {
    if (indicator.idle === "lit") {
      lights[indicator.id] = {
        brightness: "bright",
        flashing: false,
        color: inkOrColor(indicator, { kind: "unspecified" }),
      };
    }
  }
  return lights;
}
