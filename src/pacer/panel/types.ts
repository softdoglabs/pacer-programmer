import type { IndicatorId, PhysicalSwitchId } from "../hardware";
import type { PacerHue } from "../protocol/ledColors";

/*
 * What the Pacer's panel is showing at one instant: every light and the display. Computed from
 * the config, runtime state, and firmware mode by `computePanelState`, and painted by the view.
 * Colors here are semantic (Pacer hues, firmware colors, printed ink), never CSS.
 */

export type Brightness = "off" | "dim" | "bright";

export type LightColor =
  /** One of the Pacer's 12 LED hues, from a step's LED config. */
  | { kind: "hue"; hue: PacerHue }
  /** Firmware-chosen colors outside the config palette: preset select LEDs (royal blue), and the
   * selected-mode indicator on Preset / A / B (light blue). */
  | { kind: "royalBlue" }
  | { kind: "lightBlue" }
  /** A fixed-color legend lit in its own printed ink (see the indicator's hardware spec). */
  | { kind: "ink" }
  /** Color the config doesn't specify: the undocumented 0x7F "default", or an unknown code. */
  | { kind: "unspecified" };

export interface LightState {
  brightness: Brightness;
  /** Blinks between `brightness` and off. */
  flashing: boolean;
  color: LightColor;
}

export const LIGHT_OFF: LightState = { brightness: "off", flashing: false, color: { kind: "unspecified" } };

export interface SwitchPanelState {
  pressed: boolean;
  /** Only indicators the switch actually has (see its hardware spec). Missing = off. */
  lights: Partial<Record<IndicatorId, LightState>>;
}

export interface DisplayState {
  line1: string;
  line2: string;
  line2Blinking: boolean;
}

export interface PanelState {
  switches: Record<PhysicalSwitchId, SwitchPanelState>;
  display: DisplayState;
}
