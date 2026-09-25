import { describe, expect, it } from "vitest";
import { ControlId, SwitchMessageType } from "../../protocol/constants";
import type { Preset } from "../../protocol/types";
import { compileMachine, type MachineState, type StateMachine } from "../machine";
import { recoverMachine } from "../recover";

/*
 * The invariant the whole design rests on: whatever can be authored must be recoverable. Nothing
 * but the dump is persisted, so a machine survives only by being compiled to presets and read
 * back out of them. These tests are the acceptance criterion, and they exist before the editor
 * that will author these models.
 */

const body = (controlId: number, msgType: number, data: [number, number, number]): Preset["controls"] => ({
  [controlId]: { steps: { 1: { channel: 0, msgType, data, active: true } }, led: {} },
});

/**
 * What the round trip has to preserve: the states, and what each transition means. Compared by
 * *name*, because that's the only identity a dump can carry — ids live in memory and don't
 * survive, which is why the compiler insists names are present and distinct.
 */
function shape(machine: StateMachine) {
  const nameOf = new Map(machine.states.map((s) => [s.id, s.name ?? s.id]));
  return machine.states
    .map((s) => ({
      name: s.name,
      transitions: s.transitions
        .map((t) => `${t.controlId}:${t.stepNumber}->${t.to.kind === "return" ? "return" : nameOf.get(t.to.id)}`)
        .sort(),
    }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

/** One "looper running" state, entered from `origins` main presets and returning to each. */
function looperMachine(origins: number): StateMachine {
  const mains: MachineState[] = Array.from({ length: origins }, (_, i) => ({
    id: `main${i}`,
    name: `MAIN${i}`.length <= 5 ? `MAIN${i}` : `MN${i}`, // 5 characters, and distinct: the compiler insists
    body: body(ControlId.Stompswitch1, SwitchMessageType.ProgramAndBank, [i, 0, 0]),
    transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "state", id: "looper" } }],
  }));
  const looper: MachineState = {
    id: "looper",
    name: "LOOPR",
    body: body(ControlId.Stompswitch1, SwitchMessageType.CcTrigger, [53, 127, 0]),
    transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "return" } }],
  };
  return { states: [...mains, looper] };
}

describe("authoring and recovering a state machine", () => {
  it("costs one preset per origin, which is the price of the missing return address", () => {
    const compiled = compileMachine(looperMachine(12));
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    // Twelve mains, and twelve copies of the one looper state: the whole device.
    expect(compiled.slots).toHaveLength(24);
    expect(compiled.slots.filter((s) => s.stateId === "looper")).toHaveLength(12);
  });

  it("recovers what it compiled: one looper state, twelve mains, and a return", () => {
    const machine = looperMachine(12);
    const compiled = compileMachine(machine);
    if (!compiled.ok) throw new Error(compiled.error);
    const recovered = recoverMachine(compiled.config);

    expect(recovered.notes).toEqual([]);
    expect(shape(recovered)).toEqual(shape(machine));
    expect(recovered.members["LOOPR"]).toHaveLength(12);
    const looper = recovered.states.find((s) => s.name === "LOOPR");
    expect(looper?.transitions).toEqual([{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "return" } }]);
  });

  it("refuses a design that doesn't fit, rather than compiling part of it", () => {
    const tooBig = compileMachine(looperMachine(13)); // 13 mains + 13 copies = 26
    expect(tooBig.ok).toBe(false);
    if (tooBig.ok) return;
    expect(tooBig.error).toMatch(/more than the Pacer's 24 presets/);
  });

  it("gives a state that never returns one copy, however many places enter it", () => {
    // A tuner is the same wherever you came from, so it doesn't need duplicating — and the whole
    // point of the expansion is that it only pays for states that do.
    const machine: StateMachine = {
      states: [
        {
          id: "a",
          name: "A",
          body: body(ControlId.Stompswitch1, SwitchMessageType.Note, [60, 127, 0]),
          transitions: [{ controlId: ControlId.StompswitchB, stepNumber: 1, to: { kind: "state", id: "tuner" } }],
        },
        {
          id: "b",
          name: "B",
          body: body(ControlId.Stompswitch1, SwitchMessageType.Note, [62, 127, 0]),
          transitions: [{ controlId: ControlId.StompswitchB, stepNumber: 1, to: { kind: "state", id: "tuner" } }],
        },
        {
          id: "tuner",
          name: "TUNER",
          body: body(ControlId.Stompswitch1, SwitchMessageType.CcToggle, [68, 127, 0]),
          transitions: [{ controlId: ControlId.StompswitchB, stepNumber: 1, to: { kind: "state", id: "a" } }],
        },
      ],
    };
    const compiled = compileMachine(machine);
    if (!compiled.ok) throw new Error(compiled.error);
    expect(compiled.slots).toHaveLength(3);
    expect(shape(recoverMachine(compiled.config))).toEqual(shape(machine));
  });

  it("rejects a body that navigates, since the model wouldn't know about the jump", () => {
    const machine: StateMachine = {
      states: [
        {
          id: "a",
          name: "A",
          body: body(ControlId.StompswitchA, SwitchMessageType.PresetSelect, [5, 0, 0]),
          transitions: [],
        },
      ],
    };
    expect(compileMachine(machine)).toMatchObject({ ok: false, error: expect.stringContaining("use a transition") });
  });

  it("rejects a returning state nothing enters", () => {
    const machine: StateMachine = {
      states: [
        {
          id: "orphan",
          name: "ORPHN",
          body: {},
          transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "return" } }],
        },
      ],
    };
    expect(compileMachine(machine)).toMatchObject({ ok: false });
  });
});

describe("what the model refuses to let you author", () => {
  it("won't let two states share a name, since the presets couldn't tell them apart", () => {
    const twice = (id: string): MachineState => ({
      id,
      name: "SAME",
      body: body(ControlId.Stompswitch1, SwitchMessageType.Note, [60, 127, 0]),
      transitions: [],
    });
    expect(compileMachine({ states: [twice("a"), twice("b")] })).toMatchObject({
      ok: false,
      error: expect.stringContaining("after a round trip they'd be one"),
    });
  });

  it("won't let a state go unnamed", () => {
    const machine: StateMachine = { states: [{ id: "a", body: {}, transitions: [] }] };
    expect(compileMachine(machine)).toMatchObject({ ok: false, error: expect.stringContaining("needs a name") });
  });
});
