import { describe, expect, it } from "vitest";
import { ExpressionMessageType, SwitchMessageType } from "../../protocol/constants";
import type { Step, SwitchControl } from "../../protocol/types";
import { channelLabel, describeStepShort, messageTypeInfo, summarizeControl } from "../describe";

function step(msgType: number, data: [number, number, number], active = true): Step {
  return { channel: 0, msgType, data, active };
}

describe("describeStepShort", () => {
  it("summarizes common switch step types", () => {
    expect(describeStepShort(step(SwitchMessageType.ProgramAndBank, [5, 0, 0]), "switch")).toBe("PC5");
    expect(describeStepShort(step(SwitchMessageType.CcToggle, [21, 0, 127]), "switch")).toBe("CC21⇅");
    expect(describeStepShort(step(SwitchMessageType.PresetSelect, [9, 0, 0]), "switch")).toBe("→B1");
    expect(describeStepShort(step(SwitchMessageType.PresetIncDec, [1, 0, 0]), "switch")).toBe("P−");
    expect(describeStepShort(step(SwitchMessageType.Relay, [0, 2, 0]), "switch")).toBe("R3");
  });

  it("disambiguates expression pedal types from overlapping switch codes", () => {
    expect(describeStepShort(step(ExpressionMessageType.MidiCc, [7, 0, 127]), "expressionPedal")).toBe("CC7");
    expect(messageTypeInfo("expressionPedal", 0x00).name).toBe("MIDI CC");
  });
});

describe("summarizeControl", () => {
  it("joins active, non-Off steps in step order", () => {
    const control: SwitchControl = {
      steps: {
        2: step(SwitchMessageType.PresetSelect, [9, 0, 0]),
        1: step(SwitchMessageType.ProgramAndBank, [5, 0, 0]),
        3: step(SwitchMessageType.CcTrigger, [1, 127, 0], false),
        4: step(SwitchMessageType.Off, [0, 0, 0]),
      },
      led: {},
    };
    expect(summarizeControl(control, "switch")).toBe("PC5 →B1");
  });

  it("uses a dash for missing or silent controls and truncates long lists", () => {
    expect(summarizeControl(undefined, "switch")).toBe("—");
    expect(summarizeControl({ steps: { 1: step(SwitchMessageType.Off, [0, 0, 0]) }, led: {} }, "switch")).toBe("—");
    const many: SwitchControl = { steps: {}, led: {} };
    for (let n = 1; n <= 5; n++) many.steps[n] = step(SwitchMessageType.CcTrigger, [n, 127, 0]);
    expect(summarizeControl(many, "switch", 2)).toBe("CC1 CC2 …");
  });
});

describe("channelLabel", () => {
  it("shows channel byte 0 as Global and 1-16 as MIDI channels", () => {
    expect(channelLabel(0)).toBe("Global");
    expect(channelLabel(1)).toBe("1");
    expect(channelLabel(16)).toBe("16");
  });
});
