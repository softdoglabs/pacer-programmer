// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { describe, expect, it } from "vitest";
import { SwitchMessageType } from "../../protocol/constants";
import { defaultLedHue } from "../defaultLedColors";

describe("defaultLedHue (User Guide p. 12, Chart 2)", () => {
  it("maps each message type to its documented default hue", () => {
    expect(defaultLedHue(SwitchMessageType.StepSelect)).toBe("pink");
    expect(defaultLedHue(SwitchMessageType.PresetSelect)).toBe("red");
    expect(defaultLedHue(SwitchMessageType.ProgramAndBank)).toBe("orange");
    expect(defaultLedHue(SwitchMessageType.Mmc)).toBe("yellow");
    expect(defaultLedHue(SwitchMessageType.Note)).toBe("green");
    expect(defaultLedHue(SwitchMessageType.CcToggle)).toBe("blue");
    expect(defaultLedHue(SwitchMessageType.Relay)).toBe("lavender");
    expect(defaultLedHue(SwitchMessageType.NrpnFine)).toBe("purple");
    expect(defaultLedHue(SwitchMessageType.Off)).toBeUndefined();
  });
});
