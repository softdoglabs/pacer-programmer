import { describe, expect, it } from "vitest";
import { LED_COLOR_DEFAULT, decodeLedColor, ledColorName } from "../ledColors";

describe("LED color codes", () => {
  it("decodes bright (odd) and dim (even) codes for all 12 hues", () => {
    expect(decodeLedColor(0x03)).toEqual({ kind: "hue", hue: "red", brightness: "bright" });
    expect(decodeLedColor(0x04)).toEqual({ kind: "hue", hue: "red", brightness: "dim" });
    expect(decodeLedColor(0x17)).toEqual({ kind: "hue", hue: "white", brightness: "bright" });
    expect(decodeLedColor(0x18)).toEqual({ kind: "hue", hue: "white", brightness: "dim" });
  });

  it("handles off, the undocumented default, and out-of-range codes", () => {
    expect(decodeLedColor(0)).toEqual({ kind: "off" });
    expect(decodeLedColor(LED_COLOR_DEFAULT)).toEqual({ kind: "default" });
    expect(decodeLedColor(0x19)).toEqual({ kind: "unknown", code: 0x19 });
  });

  it("names codes the way the reference project does", () => {
    expect(ledColorName(0x03)).toBe("2A Red");
    expect(ledColorName(0x04)).toBe("2B Dim Red");
    expect(ledColorName(0x18)).toBe("12B Dim White");
    expect(ledColorName(0)).toBe("Off");
    expect(ledColorName(LED_COLOR_DEFAULT)).toMatch(/undocumented/);
    expect(ledColorName(0x50)).toMatch(/Unknown/);
  });
});
