import type { IndicatorId, IndicatorSpec, SwitchSpec } from "../hardware";
import { LED_COLOR_DEFAULT, decodeLedColor } from "../protocol/ledColors";
import type { DefaultLedColor } from "./defaultLedColors";
import type { LightState } from "./types";

export type SwitchLights = Partial<Record<IndicatorId, LightState>>;

/** A light at a given brightness, colored by its own printed ink if it's a fixed-color legend. */
export function inkOrColor(indicator: IndicatorSpec, fallback: LightState["color"]): LightState["color"] {
  return indicator.color.kind === "fixed" ? { kind: "ink" } : fallback;
}

/**
 * The light a config LED color code produces on an indicator.
 * - Hue codes carry their own brightness (odd = bright "A", even = dim "b"). A fixed-color
 *   legend shows that brightness in its printed ink, since it can't change color (inferred).
 * - "Default" (0x7F) uses the step message type's default color (see defaultLedColors.ts):
 *   bright "A" when the step is active, and its inactive state (dimmed "b", or off) when it isn't.
 * - An unknown code, or Default with no hue for the message type, shows bright/dim with no
 *   specific color.
 */
export function lightFromColorCode(
  indicator: IndicatorSpec,
  code: number | undefined,
  active: boolean,
  defaultColor: DefaultLedColor | undefined,
): LightState {
  const decoded = decodeLedColor(code ?? LED_COLOR_DEFAULT);
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
    case "unknown": {
      const fallback = decoded.kind === "default" ? defaultColor : undefined;
      const hue = fallback?.hue;
      return {
        brightness: active ? "bright" : (fallback?.inactive ?? "dim"),
        flashing: false,
        color: inkOrColor(indicator, hue ? { kind: "hue", hue } : { kind: "unspecified" }),
      };
    }
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
