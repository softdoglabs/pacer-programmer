// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSysex } from "../../protocol/decode";
import { CURRENT_PRESET_INDEX, ControlId, FIRST_USER_PRESET_INDEX, SwitchMessageType } from "../../protocol/constants";
import type { Preset } from "../../protocol/types";
import { compileMachine } from "../../../test/compileMachine";
import type { MachineState, MachineTarget, StateMachine } from "../model";
import { recoverMachine } from "../recover";
import { clearPreset, setJump } from "../../editing";

/*
 * The invariant the whole design rests on: whatever can be authored must be recoverable. Nothing
 * but the dump is persisted, so a machine survives only by being read back out of its presets.
 *
 * A property test: designs are built into presets by the test-side compiler (`src/test/
 * compileMachine.ts`), and the recovery has to read back the design that was meant. The editor
 * itself never compiles — it edits presets in place — but what it can make, these can describe,
 * and recovery is the one reader both answer to.
 */

const body = (controlId: number, msgType: number, data: [number, number, number]): Preset["controls"] => ({
  [controlId]: { steps: { 1: { channel: 0, msgType, data, active: true } }, led: {} },
});

/**
 * What the round trip has to preserve: the states, and what each transition means. Compared by
 * *name*, because that's the only identity a dump can carry — ids live in memory and don't
 * survive, which is why the compiler insists names are present and distinct.
 */
function describeTarget(to: MachineTarget, nameOf: Map<string, string>): string {
  if (to.kind === "return") return "return";
  if (to.kind === "state") return nameOf.get(to.id) ?? to.id;
  return `by(${to.routes
    .map((r) => `${nameOf.get(r.from)}:${r.to.kind === "return" ? "back" : nameOf.get(r.to.id)}`)
    .sort()
    .join(",")})`;
}

function shape(machine: StateMachine) {
  const nameOf = new Map(machine.states.map((s) => [s.id, s.name ?? s.id]));
  return machine.states
    .map((s) => ({
      name: s.name,
      transitions: s.transitions.map((t) => `${t.controlId}:${t.stepNumber}->${describeTarget(t.to, nameOf)}`).sort(),
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
  it("accepts a return from a state only one place enters, since it means the same thing", () => {
    /*
     * With a single origin, a return and a jump to that origin are the same machine: the presets
     * are identical, and recompiling the recovered model yields them again. It reads back as the
     * jump it literally is, which describes the configuration correctly — the two only part
     * company once a second origin exists, and then a return is expressible and recovers as one.
     */
    const machine = looperMachine(1);
    const compiled = compileMachine(machine);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const recovered = recoverMachine(compiled.config);
    const loop = recovered.states.find((s) => s.name === "LOOPR")!;
    expect(loop.transitions[0]?.to).toEqual({ kind: "state", id: "MAIN0" });

    // The point of allowing it: what comes back builds the same presets.
    const again = compileMachine({ states: recovered.states });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.config.presets).toEqual(compiled.config.presets);
  });

  it("accepts the same design once a second origin exists", () => {
    const machine = looperMachine(2);
    const compiled = compileMachine(machine);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(shape(recoverMachine(compiled.config))).toEqual(shape(machine));
  });
});

describe("the device's working copy", () => {
  it("doesn't count as a way in, so returns still read as returns", () => {
    /*
     * Every dump from a real Pacer carries idx 0, the working copy of whichever preset is loaded.
     * Its switches are a second copy of that preset's, so whatever that preset leads to looked
     * entered from two places — and a return is only recognisable while each copy has one. On the
     * owner's device that hid the return of the one hand-built looper there is.
     */
    const machine: StateMachine = {
      states: [
        ...[0, 1].map((i) => ({
          id: `m${i}`,
          name: `MAIN${i}`,
          body: body(ControlId.Stompswitch1, SwitchMessageType.Note, [60 + i, 127, 0] as [number, number, number]),
          transitions: [
            { controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "state" as const, id: "loop" } },
          ],
        })),
        {
          id: "loop",
          name: "LOOPR",
          body: body(ControlId.Stompswitch1, SwitchMessageType.Note, [99, 127, 0]),
          transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "return" as const } }],
        },
      ],
    };
    const compiled = compileMachine(machine);
    if (!compiled.ok) throw new Error(compiled.error);

    const loaded = compiled.config.presets[FIRST_USER_PRESET_INDEX]!;
    const withCurrent: typeof compiled.config = {
      ...compiled.config,
      presets: {
        ...compiled.config.presets,
        [CURRENT_PRESET_INDEX]: { ...structuredClone(loaded), index: CURRENT_PRESET_INDEX },
      },
    };

    const recovered = recoverMachine(withCurrent);
    const loop = recovered.states.find((s) => s.name === "LOOPR")!;
    expect(loop.transitions[0]?.to).toEqual({ kind: "return" });
    expect(recovered.notes).toHaveLength(0);
  });

  it("doesn't let the working copy vote on a state's name", () => {
    /*
     * Current duplicates the loaded preset but only catches up on the next send, so right after a
     * rename the two disagree. A state is named only when its presets agree, and Current isn't one
     * of its presets — counting it left the renamed state with no name at all.
     */
    const factory = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
    const A1 = FIRST_USER_PRESET_INDEX;
    const renamed = { ...factory, presets: { ...factory.presets, [A1]: { ...factory.presets[A1]!, name: "HOME " } } };
    const recovered = recoverMachine(renamed);
    const home = recovered.states.find((s) => (recovered.members[s.id] ?? []).includes(A1))!;
    expect(home.name?.trim()).toBe("HOME");
  });
});

/*
 * Shapes the editor can make and a hand-built configuration can contain, which the map has to be
 * able to read back: a returning state that leads on to another that returns to it, and a switch
 * that goes back from some ways in but not others.
 */
describe("nested and partial returns", () => {
  const state = (id: string, note: number, transitions: MachineState["transitions"]): MachineState => ({
    id,
    name: id.toUpperCase(),
    body: body(ControlId.Stompswitch1, SwitchMessageType.Note, [note, 127, 0]),
    transitions,
  });
  const A = ControlId.StompswitchA;
  const B = ControlId.StompswitchB;
  const go = (controlId: number, id: string) => ({ controlId, stepNumber: 1, to: { kind: "state" as const, id } });
  const back = (controlId: number) => ({ controlId, stepNumber: 1, to: { kind: "return" as const } });

  it("reads a returning state inside another: each looper copy has its own tuner copy coming back to it", () => {
    const machine: StateMachine = {
      states: [
        state("main0", 60, [go(A, "loopr")]),
        state("main1", 61, [go(A, "loopr")]),
        state("loopr", 70, [back(A), go(B, "tuner")]),
        state("tuner", 80, [back(A)]),
      ],
    };
    const compiled = compileMachine(machine);
    if (!compiled.ok) throw new Error(compiled.error);
    // Two mains, two looper copies, and a tuner copy per looper copy.
    expect(compiled.slots).toHaveLength(6);
    const recovered = recoverMachine(compiled.config);
    expect(recovered.notes).toEqual([]);
    expect(shape(recovered)).toEqual(shape(machine));
  });

  it("reads returns nested three deep", () => {
    const machine: StateMachine = {
      states: [
        state("main0", 60, [go(A, "loopr")]),
        state("main1", 61, [go(A, "loopr")]),
        state("loopr", 70, [back(A), go(B, "tuner")]),
        state("tuner", 80, [back(A), go(B, "metro")]),
        state("metro", 90, [back(A)]),
      ],
    };
    const compiled = compileMachine(machine);
    if (!compiled.ok) throw new Error(compiled.error);
    expect(compiled.slots).toHaveLength(8);
    expect(shape(recoverMachine(compiled.config))).toEqual(shape(machine));
  });

  const partial: StateMachine = {
    states: [
      state("main0", 60, [go(A, "loopr")]),
      state("main1", 61, [go(A, "loopr")]),
      state("main2", 62, [go(A, "loopr")]),
      // Back to MAIN0 and MAIN1, but from MAIN2 always to MAIN0.
      state("loopr", 70, [
        {
          controlId: A,
          stepNumber: 1,
          to: {
            kind: "byEntry",
            routes: [
              { from: "main0", to: { kind: "return" } },
              { from: "main1", to: { kind: "return" } },
              { from: "main2", to: { kind: "state", id: "main0" } },
            ],
          },
        },
      ]),
    ],
  };

  it("reads a switch that goes back from some ways in and somewhere fixed from others", () => {
    const compiled = compileMachine(partial);
    if (!compiled.ok) throw new Error(compiled.error);
    const recovered = recoverMachine(compiled.config);
    expect(recovered.notes).toEqual([]);
    expect(shape(recovered)).toEqual(shape(partial));
  });

  it("reads the same table when two ways in share a copy, since they lead to the same places", () => {
    // MAIN2's copy leads where MAIN0's does, so a hand-built configuration can point MAIN2 at
    // MAIN0's copy and do without one. Same machine, one preset fewer.
    const compiled = compileMachine(partial);
    if (!compiled.ok) throw new Error(compiled.error);
    const slot = (key: string) => compiled.slots.find((s) => s.key === key)!.presetIndex;
    const main0Copy = compiled.slots.find((s) => s.stateId === "loopr" && s.key.endsWith("main0<"))!.presetIndex;
    const main2Copy = compiled.slots.find((s) => s.stateId === "loopr" && s.key.endsWith("main2<"))!.presetIndex;
    let shared = setJump(compiled.config, slot("main2<"), A, 1, main0Copy);
    shared = clearPreset(shared, main2Copy);
    const recovered = recoverMachine(shared);
    expect(recovered.members["LOOPR"]).toHaveLength(2);
    expect(shape(recovered).filter((s) => s.name !== "EMPTY")).toEqual(shape(partial));
  });

  it("reads a table with no way back at all: somewhere different from each way in", () => {
    const machine: StateMachine = {
      states: [
        state("main0", 60, [go(A, "loopr")]),
        state("main1", 61, [go(A, "loopr")]),
        state("tuner", 80, [go(A, "main0")]),
        state("loopr", 70, [
          {
            controlId: A,
            stepNumber: 1,
            to: {
              kind: "byEntry",
              routes: [
                { from: "main0", to: { kind: "state", id: "tuner" } },
                { from: "main1", to: { kind: "state", id: "main0" } },
              ],
            },
          },
        ]),
      ],
    };
    const compiled = compileMachine(machine);
    if (!compiled.ok) throw new Error(compiled.error);
    expect(shape(recoverMachine(compiled.config))).toEqual(shape(machine));
  });
});
