import { describe, expect, it } from "vitest";
import { ControlId, userPresetIndex } from "../../protocol/constants";
import { presetButtonLed, presetSelectLed } from "../presetSelectLeds";

const NUMBERS = [1, 2, 3, 4, 5, 6].map((n) => ControlId.Stompswitch1 + n - 1);
const B3 = userPresetIndex(1, 3);

describe("presetSelectLed", () => {
  it("on the loaded preset's bank: that number is solid bright, the other five flash dim", () => {
    const leds = NUMBERS.map((id) => presetSelectLed(id, 1, B3));
    expect(leds[2]).toEqual({ brightness: "bright", flashing: false });
    for (const i of [0, 1, 3, 4, 5]) expect(leds[i]).toEqual({ brightness: "dim", flashing: true });
  });

  it("on another bank: all six flash dim", () => {
    for (const id of NUMBERS) expect(presetSelectLed(id, 3, B3)).toEqual({ brightness: "dim", flashing: true });
  });

  it("A-D: only the pending bank is lit, solid bright", () => {
    expect(presetSelectLed(ControlId.StompswitchC, 2, B3)).toEqual({ brightness: "bright", flashing: false });
    expect(presetSelectLed(ControlId.StompswitchB, 2, B3)).toEqual({ brightness: "off", flashing: false });
  });

  it("is undefined for controls preset select doesn't use", () => {
    expect(presetSelectLed(ControlId.Footswitch1, 0, 0)).toBeUndefined();
  });
});

describe("presetButtonLed", () => {
  it("flashes bright in preset select, is solid in Track/Transport, and off on a user preset", () => {
    expect(presetButtonLed("presetSelect")).toEqual({ brightness: "bright", flashing: true });
    expect(presetButtonLed("track")).toEqual({ brightness: "bright", flashing: false });
    expect(presetButtonLed("user")).toEqual({ brightness: "off", flashing: false });
  });
});
