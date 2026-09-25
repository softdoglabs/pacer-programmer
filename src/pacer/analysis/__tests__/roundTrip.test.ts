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

describe("what makes two states the same", () => {
  const withBody = (id: string, name: string, note: number): MachineState => ({
    id,
    name,
    body: body(ControlId.Stompswitch1, SwitchMessageType.Note, [note, 127, 0]),
    transitions: [],
  });

  it("lets two states share a name when they do different things", () => {
    // A name is a label, not an identity: what tells two states apart is behaving differently,
    // which is what the recovery groups on. Five characters is little enough to want to reuse.
    const machine: StateMachine = { states: [withBody("a", "LOOP", 60), withBody("b", "LOOP", 62)] };
    const compiled = compileMachine(machine);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const recovered = recoverMachine(compiled.config);
    expect(recovered.states).toHaveLength(2);
    expect(recovered.states.every((s) => s.name === "LOOP")).toBe(true);
  });

  it("refuses two states that differ in nothing but where they lead", () => {
    // They would come back as one, because by the rule they *are* one.
    const machine: StateMachine = { states: [withBody("a", "ONE", 60), withBody("b", "TWO", 60)] };
    expect(compileMachine(machine)).toMatchObject({
      ok: false,
      error: expect.stringContaining("come back as one state"),
    });
  });

  it("lets a state go unnamed", () => {
    const machine: StateMachine = {
      states: [{ id: "a", body: body(ControlId.Stompswitch1, SwitchMessageType.Note, [60, 127, 0]), transitions: [] }],
    };
    expect(compileMachine(machine)).toMatchObject({ ok: true });
  });

  it("refuses a name too long for the display", () => {
    expect(compileMachine({ states: [withBody("a", "TOOLONG", 60)] })).toMatchObject({
      ok: false,
      error: expect.stringContaining("5 characters"),
    });
  });
});

describe("the invariant, enforced rather than assumed", () => {
  it("refuses a return from a state only one place enters", () => {
    /*
     * With a single origin a return and a jump to that origin compile to the same preset, so the
     * presets don't record which was meant and it comes back as the jump it literally is. It used
     * to be accepted and documented as a degeneracy; the compiler now says so, because the
     * difference starts to matter the moment a second origin is added.
     */
    const machine: StateMachine = {
      states: [
        {
          id: "main",
          name: "MAIN",
          body: body(ControlId.Stompswitch1, SwitchMessageType.Note, [60, 127, 0]),
          transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "state", id: "loop" } }],
        },
        {
          id: "loop",
          name: "LOOP",
          body: body(ControlId.Stompswitch1, SwitchMessageType.CcTrigger, [53, 127, 0]),
          transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "return" } }],
        },
      ],
    };
    expect(compileMachine(machine)).toMatchObject({
      ok: false,
      error: expect.stringContaining("can't be told from a jump"),
    });
  });

  it("accepts the same design once a second origin exists", () => {
    const machine = looperMachine(2);
    const compiled = compileMachine(machine);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(shape(recoverMachine(compiled.config))).toEqual(shape(machine));
  });
});
