import { describe, expect, it } from "vitest";
import { SwitchMessageType } from "../../protocol/constants";
import { defaultLedColor } from "../defaultLedColors";

describe("defaultLedColor (User Guide p. 12, Chart 2)", () => {
  it("maps each message type to its documented default hue", () => {
    const hue = (t: number) => defaultLedColor(t)?.hue;
    expect(hue(SwitchMessageType.StepSelect)).toBe("pink");
    expect(hue(SwitchMessageType.PresetSelect)).toBe("red");
    expect(hue(SwitchMessageType.ProgramAndBank)).toBe("orange");
    expect(hue(SwitchMessageType.Mmc)).toBe("yellow");
    expect(hue(SwitchMessageType.Note)).toBe("green");
    expect(hue(SwitchMessageType.CcToggle)).toBe("blue");
    expect(hue(SwitchMessageType.Relay)).toBe("lavender");
    expect(hue(SwitchMessageType.NrpnFine)).toBe("purple");
    expect(defaultLedColor(SwitchMessageType.Off)).toBeUndefined();
  });

  it("rests dim for most types, but off for preset navigation (factory A-D are off at rest)", () => {
    expect(defaultLedColor(SwitchMessageType.ProgramAndBank)?.inactive).toBe("dim");
    expect(defaultLedColor(SwitchMessageType.CcTrigger)?.inactive).toBe("dim");
    expect(defaultLedColor(SwitchMessageType.PresetSelect)?.inactive).toBe("off");
    expect(defaultLedColor(SwitchMessageType.PresetIncDec)?.inactive).toBe("off");
  });
});
