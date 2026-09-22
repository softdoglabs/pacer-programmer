import type { IndicatorId, IndicatorSpec } from "../hardware";
import { LED_COLOR_DEFAULT, decodeLedColor, type PacerHue } from "../protocol/ledColors";
import type { LightState } from "./types";

export type SwitchLights = Partial<Record<IndicatorId, LightState>>;

/** The color a firmware-lit legend shows: its printed ink, or the given fallback for a bar. */
export function inkOrColor(indicator: IndicatorSpec, fallback: LightState["color"]): LightState["color"] {
  return indicator.color.ink !== undefined ? { kind: "ink" } : fallback;
}

/**
 * The light a config LED color code produces on an indicator.
 * - Hue codes carry their own brightness (odd = bright "A", even = dim "b"). Every light is RGB,
 *   legends included, so the code's color is what shows (owner-confirmed).
 * - "Default" (0x7F) uses the step message type's default hue (see defaultLedColors.ts):
 *   bright "A" when the step is on, dimmed "b" when it's off.
 * - An unknown code, or Default with no hue for the message type, shows bright/dim with no
 *   specific color.
 */
export function lightFromColorCode(
  indicator: IndicatorSpec,
  code: number | undefined,
  active: boolean,
  defaultHue: PacerHue | undefined,
): LightState {
  const decoded = decodeLedColor(code ?? LED_COLOR_DEFAULT);
  switch (decoded.kind) {
    case "off":
      return { brightness: "off", flashing: false, color: { kind: "unspecified" } };
    case "hue":
      return {
        brightness: decoded.brightness,
        flashing: false,
        color: { kind: "hue", hue: decoded.hue },
      };
    case "default":
    case "unknown": {
      const hue = decoded.kind === "default" ? defaultHue : undefined;
      return {
        brightness: active ? "bright" : "dim",
        flashing: false,
        color: hue ? { kind: "hue", hue } : { kind: "unspecified" },
      };
    }
  }
}
