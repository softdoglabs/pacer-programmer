import { describe, expect, it } from "vitest";
import {
  CURRENT_PRESET_INDEX,
  ControlId,
  SwitchMessageType,
  presetIndexToPresetSelectTarget,
  userPresetIndex,
} from "../../protocol/constants";
import { createEmptyPacerConfig, getOrCreateControl, getOrCreatePreset, type PacerConfig } from "../../protocol/types";
import { machineOf } from "../machineOf";
import { presetEntrants, readsAsReturn, soleEntrant, wayBack } from "../returns";

const A = (n: number) => userPresetIndex(0, n);

/** A preset with a note on stomp 1, so presets can be told apart by what they do. */
function preset(config: PacerConfig, index: number, name: string, note: number) {
  const p = getOrCreatePreset(config, index);
  p.name = name;
  getOrCreateControl(p, ControlId.Stompswitch1).steps[1] = {
    channel: 0,
    msgType: SwitchMessageType.Note,
    data: [note, 127, 0],
    active: true,
  };
}

function jump(config: PacerConfig, from: number, controlId: number, to: number) {
  getOrCreateControl(getOrCreatePreset(config, from), controlId).steps[1] = {
    channel: 0,
    msgType: SwitchMessageType.PresetSelect,
    data: [presetIndexToPresetSelectTarget(to), 0, 0],
    active: true,
  };
}

function step(config: PacerConfig, from: number, controlId: number, direction: 0 | 1) {
  getOrCreateControl(getOrCreatePreset(config, from), controlId).steps[1] = {
    channel: 0,
    msgType: SwitchMessageType.PresetIncDec,
    data: [direction, 0, 0],
    active: true,
  };
}

describe("what enters a preset", () => {
  it("is a switch that names it — not stepping, not the working copy, not itself", () => {
    const config = createEmptyPacerConfig();
    for (const n of [1, 2, 3]) preset(config, A(n), `P${n}`, 60 + n);
    jump(config, A(1), ControlId.StompswitchA, A(3)); // names A3: counts
    step(config, A(2), ControlId.StompswitchD, 0); // A2's "next" is A3: a direction, doesn't count
    jump(config, A(3), ControlId.StompswitchB, A(3)); // a reload of itself: doesn't count
    // The working copy of A1, as every real dump has: a second copy of A1's switches.
    preset(config, CURRENT_PRESET_INDEX, "P1", 61);
    jump(config, CURRENT_PRESET_INDEX, ControlId.StompswitchA, A(3));

    expect(presetEntrants(config, A(3))).toEqual([A(1)]);
    expect(soleEntrant(config, A(3))).toBe(A(1));
  });
});

describe("coming back", () => {
  /** Two mains, each entering its own copy of LOOPR, each copy leading back. */
  function looper() {
    const config = createEmptyPacerConfig();
    preset(config, A(1), "MAIN0", 60);
    preset(config, A(2), "MAIN1", 61);
    preset(config, A(3), "LOOPR", 99);
    preset(config, A(4), "LOOPR", 99);
    jump(config, A(1), ControlId.StompswitchA, A(3));
    jump(config, A(2), ControlId.StompswitchA, A(4));
    jump(config, A(3), ControlId.StompswitchA, A(1));
    jump(config, A(4), ControlId.StompswitchA, A(2));
    return config;
  }

  it("reads as a return when every copy leads back to what entered it", () => {
    const config = looper();
    expect(readsAsReturn(config, [A(3), A(4)], [A(1), A(2)])).toBe(true);
    // Both copies to the same place is a jump, however it came about.
    expect(readsAsReturn(config, [A(3), A(4)], [A(1), A(1)])).toBe(false);
  });

  it("never reads as a return from one copy: the presets can't say which was meant", () => {
    const config = looper();
    expect(readsAsReturn(config, [A(3)], [A(1)])).toBe(false);
  });

  it("finds the way back from the recovered return when it's settled, and offers it when it isn't", () => {
    const settled = looper();
    const machine = machineOf(settled);
    const loop = machine.states.find((s) => s.name === "LOOPR")!;
    expect(wayBack(settled, machine, loop.id)).toEqual([{ controlId: ControlId.StompswitchA, stepNumber: 1 }]);

    // One copy entered from one place: the switch that leads back there is the would-be way back.
    const open = createEmptyPacerConfig();
    preset(open, A(1), "MAIN0", 60);
    preset(open, A(3), "LOOPR", 99);
    jump(open, A(1), ControlId.StompswitchA, A(3));
    jump(open, A(3), ControlId.StompswitchB, A(1));
    const single = machineOf(open);
    const one = single.states.find((s) => s.name === "LOOPR")!;
    expect(wayBack(open, single, one.id)).toEqual([{ controlId: ControlId.StompswitchB, stepNumber: 1 }]);
  });
});
