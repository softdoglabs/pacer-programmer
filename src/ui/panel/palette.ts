import type { InkColor, IndicatorSpec } from "@/pacer/hardware";
import type { LightState } from "@/pacer/panel";
import { decodeLedColor, type PacerHue } from "@/pacer/protocol/ledColors";

/*
 * The only place semantic light states become CSS. The hex values are our own approximations
 * of the hardware's colors, not measured.
 */

const HUE_CSS: Record<PacerHue, string> = {
  pink: "#ff8fb1",
  red: "#ff3b30",
  orange: "#ff8c00",
  amber: "#ffbf00",
  yellow: "#ffe600",
  lime: "#7dff3a",
  green: "#1fbf4a",
  teal: "#18b7a8",
  blue: "#2f6bff",
  lavender: "#c9b8ff",
  purple: "#a23dff",
  white: "#f4f4f5",
};

const INK_CSS: Record<InkColor, string> = {
  white: "#f4f4f5",
  red: "#ff4034",
  orange: "#ff9a1f",
  yellow: "#fff44f", // lemon yellow (observed on the front-row text legends)
  green: "#34d058",
  blue: "#5b8cff",
};

const ROYAL_BLUE = "#4169e1";
const LIGHT_BLUE = "#7cc7ff";
/** Color the config leaves unspecified (the undocumented 0x7F default): a neutral gray. */
const UNSPECIFIED = "#aeb3bd";
/** An unlit bar. */
export const LIGHT_OFF_CSS = "#26262a";
/** An unlit printed legend: faintly visible ink on the dark panel. */
export const LEGEND_UNLIT_CSS = "#3a3a40";

function dim(css: string): string {
  return `color-mix(in srgb, ${css} 40%, black)`;
}

export interface LightPaint {
  /** Fill color; the unlit color when the light is off. */
  fill: string;
  glow: boolean;
  flashing: boolean;
}

/** How to paint a light on a given indicator. */
export function paintLight(light: LightState | undefined, indicator: IndicatorSpec): LightPaint {
  const unlit = indicator.face.kind === "bar" ? LIGHT_OFF_CSS : LEGEND_UNLIT_CSS;
  if (!light || light.brightness === "off") return { fill: unlit, glow: false, flashing: false };

  let base: string;
  switch (light.color.kind) {
    case "hue":
      base = HUE_CSS[light.color.hue];
      break;
    case "royalBlue":
      base = ROYAL_BLUE;
      break;
    case "lightBlue":
      base = LIGHT_BLUE;
      break;
    case "ink":
      base = indicator.color.ink !== undefined ? INK_CSS[indicator.color.ink] : UNSPECIFIED;
      break;
    case "unspecified":
      base = UNSPECIFIED;
      break;
  }
  return {
    fill: light.brightness === "dim" ? dim(base) : base,
    glow: light.brightness === "bright",
    flashing: light.flashing,
  };
}

/** CSS for a raw config color code (inspector swatches). */
export function colorCodeCss(code: number): string {
  const decoded = decodeLedColor(code);
  switch (decoded.kind) {
    case "off":
      return "transparent";
    case "hue":
      return decoded.brightness === "dim" ? dim(HUE_CSS[decoded.hue]) : HUE_CSS[decoded.hue];
    case "default":
    case "unknown":
      return UNSPECIFIED;
  }
}
