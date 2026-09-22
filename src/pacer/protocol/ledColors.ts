/**
 * Pacer LED color codes, as stored in a step's LED active/inactive color fields.
 * 0x01-0x18 are 12 hues, each as a bright "A" code (odd) and a dim "B" code (even). The
 * code -> name mapping is a documented protocol fact (the reference project's COLORS table,
 * dump_format.md), and the factory COLOR preset pairs each bright code with its dim neighbor.
 */
export const PACER_HUES = [
  "pink",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "teal",
  "blue",
  "lavender",
  "purple",
  "white",
] as const;
export type PacerHue = (typeof PACER_HUES)[number];

export const LED_COLOR_OFF = 0x00;
/** Used on nearly every factory LED entry: the message type's own color (User Guide p.12 chart 2). */
export const LED_COLOR_DEFAULT = 0x7f;

export type DecodedLedColor =
  | { kind: "off" }
  | { kind: "hue"; hue: PacerHue; brightness: "bright" | "dim" }
  | { kind: "default" }
  | { kind: "unknown"; code: number };

export function decodeLedColor(code: number): DecodedLedColor {
  if (code === LED_COLOR_OFF) return { kind: "off" };
  if (code === LED_COLOR_DEFAULT) return { kind: "default" };
  const hue = PACER_HUES[Math.floor((code - 1) / 2)];
  if (!Number.isInteger(code) || code < 1 || hue === undefined) return { kind: "unknown", code };
  return { kind: "hue", hue, brightness: code % 2 === 1 ? "bright" : "dim" };
}

/** The reference project's name for a color code, e.g. "2A Red", "2B Dim Red". */
export function ledColorName(code: number): string {
  const color = decodeLedColor(code);
  switch (color.kind) {
    case "off":
      return "Off";
    case "default":
      return "Default (message type color)";
    case "unknown":
      return `Unknown (0x${color.code.toString(16)})`;
    case "hue": {
      const n = PACER_HUES.indexOf(color.hue) + 1;
      const hueName = color.hue[0]!.toUpperCase() + color.hue.slice(1);
      return color.brightness === "bright" ? `${n}A ${hueName}` : `${n}B Dim ${hueName}`;
    }
  }
}
