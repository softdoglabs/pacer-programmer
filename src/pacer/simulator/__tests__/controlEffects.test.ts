import { describe, expect, it } from "vitest";
import { ControlMode, SwitchMessageType } from "../../protocol/constants";
import type { SwitchControl } from "../../protocol/types";
import { resolveControl } from "../controlEffects";
import { createControlRuntimeState } from "../types";

function ccStep(controller: number, down: number, up: number, active = true) {
  return {
    channel: 1,
    msgType: SwitchMessageType.CcTrigger,
    data: [controller, down, up] as [number, number, number],
    active,
  };
}

describe("resolveControl — AllStepsAtOnce (default)", () => {
  it("fires every active step together on one press, skipping inactive steps", () => {
    const control: SwitchControl = {
      steps: {
        1: ccStep(10, 127, 0, true),
        2: ccStep(20, 127, 0, false), // inactive — should not fire
        3: ccStep(30, 127, 0, true),
      },
      led: {},
    };
    const effect = resolveControl(control, "switch", "press", createControlRuntimeState());
    expect(effect.messages).toEqual([
      { kind: "controlChange", channel: 1, controller: 10, value: 127 },
      { kind: "controlChange", channel: 1, controller: 30, value: 127 },
    ]);
    expect(effect.nextRuntimeState.pressed).toBe(true);
  });

  it("fires the matching release messages for the same steps", () => {
    const control: SwitchControl = { steps: { 1: ccStep(10, 127, 0) }, led: {} };
    const pressed = resolveControl(control, "switch", "press", createControlRuntimeState()).nextRuntimeState;
    const effect = resolveControl(control, "switch", "release", pressed);
    expect(effect.messages).toEqual([{ kind: "controlChange", channel: 1, controller: 10, value: 0 }]);
    expect(effect.nextRuntimeState.pressed).toBe(false);
  });
});

describe("resolveControl — Sequence mode", () => {
  it("cycles the pointer across all 6 slots (not just populated ones), wrapping after the 6th press", () => {
    const control: SwitchControl = {
      controlMode: ControlMode.Sequence,
      steps: { 1: ccStep(1, 1, 0), 2: ccStep(2, 1, 0), 3: ccStep(3, 1, 0) }, // 4-6 left empty on purpose
      led: {},
    };
    let state = createControlRuntimeState();
    const controllersOrEmpty: (number | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const pressed = resolveControl(control, "switch", "press", state);
      controllersOrEmpty.push(
        pressed.messages.length > 0 ? (pressed.messages[0] as { controller: number }).controller : null,
      );
      state = resolveControl(control, "switch", "release", pressed.nextRuntimeState).nextRuntimeState;
    }
    // presses 1-3 hit populated steps; 4-6 hit empty slots (still consume a press, no message);
    // the 7th press wraps back to step 1.
    expect(controllersOrEmpty).toEqual([1, 2, 3, null, null, null, 1]);
  });

  it("skips empty step slots (produces no message) but still advances the pointer", () => {
    const control: SwitchControl = {
      controlMode: ControlMode.Sequence,
      steps: { 1: ccStep(1, 1, 0) }, // steps 2-6 undefined
      led: {},
    };
    let state = createControlRuntimeState();
    const pressed1 = resolveControl(control, "switch", "press", state);
    expect(pressed1.messages.length).toBe(1);
    state = resolveControl(control, "switch", "release", pressed1.nextRuntimeState).nextRuntimeState;

    const pressed2 = resolveControl(control, "switch", "press", state); // pointer now at step 2 (empty)
    expect(pressed2.messages).toEqual([]);
    expect(pressed2.nextRuntimeState.sequencePointer).toBe(3);
  });
});

describe("resolveControl — ExternalStepSelect mode", () => {
  it("always fires step 1 regardless of press count (deferred cross-control targeting)", () => {
    const control: SwitchControl = {
      controlMode: ControlMode.ExternalStepSelect,
      steps: { 1: ccStep(1, 1, 0), 2: ccStep(2, 1, 0) },
      led: {},
    };
    let state = createControlRuntimeState();
    for (let i = 0; i < 3; i++) {
      const pressed = resolveControl(control, "switch", "press", state);
      expect(pressed.messages).toEqual([{ kind: "controlChange", channel: 1, controller: 1, value: 1 }]);
      state = resolveControl(control, "switch", "release", pressed.nextRuntimeState).nextRuntimeState;
    }
  });
});

describe("resolveControl — guards", () => {
  it("warns and no-ops on a press while already held", () => {
    const control: SwitchControl = { steps: { 1: ccStep(1, 1, 0) }, led: {} };
    const pressed = resolveControl(control, "switch", "press", createControlRuntimeState());
    const secondPress = resolveControl(control, "switch", "press", pressed.nextRuntimeState);
    expect(secondPress.messages).toEqual([]);
    expect(secondPress.warnings.length).toBe(1);
  });

  it("warns and no-ops on a release without a matching press", () => {
    const control: SwitchControl = { steps: { 1: ccStep(1, 1, 0) }, led: {} };
    const effect = resolveControl(control, "switch", "release", createControlRuntimeState());
    expect(effect.messages).toEqual([]);
    expect(effect.warnings.length).toBe(1);
  });
});
