import { describe, expect, it } from "vitest";
import { compileMachine, recoverMachine, type MachineState, type StateMachine } from "../../analysis";
import { ControlId, SwitchMessageType, presetSelectTargetToIndex } from "../../protocol/constants";
import type { PacerConfig, Preset } from "../../protocol/types";
import { editRoute, switchUses } from "../routes";

const body = (note: number): Preset["controls"] => ({
  [ControlId.Stompswitch1]: {
    steps: { 1: { channel: 0, msgType: SwitchMessageType.Note, data: [note, 127, 0], active: true } },
    led: {},
  },
});

/** Mains that all enter one looper, which comes back — so the looper has a copy per main. */
function looper(mainCount: number): StateMachine {
  const mains: MachineState[] = Array.from({ length: mainCount }, (_, i) => ({
    id: `m${i}`,
    name: `MAIN${i}`,
    body: body(60 + i),
    // Only the first two enter the looper, so there's a main left over to route from.
    transitions:
      i < 2 ? [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "state" as const, id: "loop" } }] : [],
  }));
  return {
    states: [
      ...mains,
      {
        id: "loop",
        name: "LOOPR",
        body: body(99),
        transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "return" } }],
      },
    ],
  };
}

function compiled(machine: StateMachine): PacerConfig {
  const result = compileMachine(machine);
  if (!result.ok) throw new Error(result.error);
  return result.config;
}

/** Where a switch's step leads on one preset, as a preset index. */
function jumpTarget(config: PacerConfig, presetIndex: number, controlId: number, stepNumber: number) {
  const step = config.presets[presetIndex]?.controls[controlId]?.steps[stepNumber];
  if (!step?.active || step.msgType !== SwitchMessageType.PresetSelect) return undefined;
  return presetSelectTargetToIndex(step.data[0]);
}

describe("routing between states", () => {
  it("writes one route into every copy of the state it leaves", () => {
    const config = compiled(looper(2));
    const before = recoverMachine(config);
    const loop = before.states.find((s) => s.name === "LOOPR")!;
    const main = before.states.find((s) => s.name === "MAIN0")!;
    expect(before.members[loop.id]).toHaveLength(2);

    const result = editRoute(config, {
      fromStateId: loop.id,
      controlId: ControlId.StompswitchB,
      stepNumber: 1,
      toStateId: main.id,
    });
    if (!result.ok) throw new Error(result.error);

    const home = before.members[main.id]![0]!;
    for (const copy of before.members[loop.id]!) {
      expect(jumpTarget(result.config, copy, ControlId.StompswitchB, 1)).toBe(home);
    }
    // One switch on one state, as far as the map is concerned — not two presets that must be
    // kept in step by hand.
    const after = recoverMachine(result.config);
    const stillOne = after.states.find((s) => s.name === "LOOPR")!;
    expect(after.members[stillOne.id]).toHaveLength(2);
    expect(stillOne.transitions.some((t) => t.to.kind === "return")).toBe(true);
  });

  it("refuses to enter a state that comes back, because that needs another copy of it", () => {
    const config = compiled(looper(3));
    const machine = recoverMachine(config);
    const loop = machine.states.find((s) => s.name === "LOOPR")!;
    const spare = machine.states.find((s) => s.name === "MAIN2")!;

    const result = editRoute(config, {
      fromStateId: spare.id,
      controlId: ControlId.StompswitchA,
      stepNumber: 1,
      toStateId: loop.id,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/one more preset/);
  });

  it("refuses to take away the route a copy comes back along", () => {
    /*
     * Nothing stores the fact that LOOPR returns: a copy returns because one preset leads to it
     * and it leads back. Take that away and it silently becomes a jump to a preset that no longer
     * sends you there.
     */
    const config = compiled(looper(2));
    const machine = recoverMachine(config);
    const main = machine.states.find((s) => s.name === "MAIN0")!;

    const result = editRoute(config, {
      fromStateId: main.id,
      controlId: ControlId.StompswitchA,
      stepNumber: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/coming back/);
  });

  it("takes away a route that nothing depends on, leaving the step unused", () => {
    const machine: StateMachine = {
      states: [
        {
          id: "a",
          name: "A",
          body: body(60),
          transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 2, to: { kind: "state", id: "b" } }],
        },
        { id: "b", name: "B", body: body(61), transitions: [] },
      ],
    };
    const config = compiled(machine);
    const before = recoverMachine(config);
    const a = before.states.find((s) => s.name === "A")!;

    const result = editRoute(config, { fromStateId: a.id, controlId: ControlId.StompswitchA, stepNumber: 2 });
    if (!result.ok) throw new Error(result.error);

    const slot = before.members[a.id]![0]!;
    const step = result.config.presets[slot]?.controls[ControlId.StompswitchA]?.steps[2];
    expect(step?.msgType).toBe(SwitchMessageType.Off);
    expect(step?.active).toBe(false);
    const after = recoverMachine(result.config);
    expect(after.states.flatMap((s) => s.transitions)).toHaveLength(0);
  });

  it("says what each switch already carries, so a route can be put somewhere free", () => {
    const config = compiled(looper(2));
    const machine = recoverMachine(config);
    const loop = machine.states.find((s) => s.name === "LOOPR")!;

    const uses = switchUses(config, loop.id);
    const a = uses.find((u) => u.controlId === ControlId.StompswitchA)!;
    expect(a.route?.isReturn).toBe(true);
    expect(a.route?.stepNumber).toBe(1);
    expect(a.freeStep).toBe(2); // step 1 is the return, so a new route goes on step 2

    const one = uses.find((u) => u.controlId === ControlId.Stompswitch1)!;
    expect(one.route).toBeUndefined();
    expect(one.sends).toBe(1); // the state's body: a note on stomp 1
    expect(one.freeStep).toBe(2);
  });
});
