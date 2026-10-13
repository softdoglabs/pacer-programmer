// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { describe, expect, it } from "vitest";
import { compileMachine } from "../../../test/compileMachine";
import { recoverMachine, type MachineState, type StateMachine } from "../../analysis";
import { ControlId, SwitchMessageType, presetSelectTargetToIndex, userPresetIndex } from "../../protocol/constants";
import type { PacerConfig, Preset } from "../../protocol/types";
import { readFileSync } from "node:fs";
import { clearPreset, isSparePreset } from "../../editing";
import { decodeSysex } from "../../protocol/decode";
import { clearablePresets, editRoute, movePreset, planRoute, switchUses, type RouteChange } from "..";

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

const to = (id: string) => ({ kind: "state" as const, id });
const back = { kind: "return" as const };
const A = ControlId.StompswitchA;
const B = ControlId.StompswitchB;

/** MAIN0 enters a single LOOPR preset whose A goes to MAIN0; MAIN1, MAIN2 and MAIN3 stand by. */
function sharedLooper(): PacerConfig {
  const result = compileMachine({
    states: [
      { id: "m0", name: "MAIN0", body: body(60), transitions: [{ controlId: A, stepNumber: 1, to: to("loop") }] },
      { id: "m1", name: "MAIN1", body: body(61), transitions: [] },
      { id: "m2", name: "MAIN2", body: body(62), transitions: [] },
      { id: "m3", name: "MAIN3", body: body(63), transitions: [] },
      { id: "loop", name: "LOOPR", body: body(99), transitions: [{ controlId: A, stepNumber: 1, to: to("m0") }] },
    ],
  });
  if (!result.ok) throw new Error(result.error);
  return result.config;
}

/** Recovered state by name, with its presets. */
function find(config: PacerConfig, name: string) {
  const machine = recoverMachine(config);
  const state = machine.states.find((s) => s.name?.trim() === name)!;
  return { state, id: state.id, presets: machine.members[state.id] ?? [], machine };
}

const spares = (config: PacerConfig, n: number) =>
  Array.from({ length: 24 }, (_, i) => i + 1)
    .filter((i) => !config.presets[i] || isSparePreset(config.presets[i]))
    .slice(0, n);

function applied(config: PacerConfig, change: RouteChange, into: number[] = []) {
  const result = editRoute(config, change, into);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("routing between states", () => {
  it("writes one route into every copy of the state it leaves", () => {
    const config = compiled(looper(2));
    const loop = find(config, "LOOPR");
    const main = find(config, "MAIN0");
    expect(loop.presets).toHaveLength(2);

    const result = applied(config, { fromStateId: loop.id, controlId: B, stepNumber: 1, to: to(main.id) });
    for (const copy of loop.presets) expect(jumpTarget(result.config, copy, B, 1)).toBe(main.presets[0]);
    // One switch on one state, as far as the map is concerned.
    const after = find(result.config, "LOOPR");
    expect(after.presets).toHaveLength(2);
    expect(after.state.transitions.some((t) => t.to.kind === "return")).toBe(true);
  });

  it("enters a state whose exits are fixed without asking or costing anything", () => {
    // The first half of the user's looper: MAIN1 opens the same LOOPR, whose A still goes to MAIN0.
    const config = sharedLooper();
    const change = { fromStateId: find(config, "MAIN1").id, controlId: A, stepNumber: 1, to: to("LOOPR") };
    expect(planRoute(config, change)).toEqual({ ok: true, needs: [], freed: [] });
    const result = applied(config, change);
    const loop = find(result.config, "LOOPR");
    expect(loop.presets).toHaveLength(1);
    expect(loop.state.transitions).toEqual([{ controlId: A, stepNumber: 1, to: to("MAIN0") }]);
  });

  it("makes a switch go back where it came from, with a copy per way in, when asked", () => {
    let config = applied(sharedLooper(), {
      fromStateId: "MAIN1",
      controlId: A,
      stepNumber: 1,
      to: to("LOOPR"),
    }).config;
    // LOOPR's A already goes to MAIN0; going back instead needs a copy for MAIN1.
    const change = { fromStateId: "LOOPR", controlId: A, stepNumber: 1, to: back };
    const plan = planRoute(config, change);
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.needs).toEqual([{ stateId: "LOOPR", enteredFrom: "MAIN1" }]);
    // Without somewhere to put it, it says so rather than picking a preset itself.
    expect(editRoute(config, change).ok).toBe(false);

    const [slot] = spares(config, 1);
    config = applied(config, change, [slot!]).config;
    const loop = find(config, "LOOPR");
    expect(loop.presets).toHaveLength(2);
    expect(loop.state.transitions).toEqual([{ controlId: A, stepNumber: 1, to: back }]);
    const m1 = find(config, "MAIN1").presets[0]!;
    expect(jumpTarget(config, m1, A, 1)).toBe(slot);
    expect(jumpTarget(config, slot!, A, 1)).toBe(m1);
  });

  it("needs no copy when a different switch leads to the other place", () => {
    const config = applied(sharedLooper(), {
      fromStateId: "MAIN1",
      controlId: A,
      stepNumber: 1,
      to: to("LOOPR"),
    }).config;
    // A goes to MAIN0, B to MAIN1: two fixed exits, one preset.
    const change = { fromStateId: "LOOPR", controlId: B, stepNumber: 1, to: to("MAIN1") };
    expect(planRoute(config, change)).toEqual({ ok: true, needs: [], freed: [] });
    const loop = find(applied(config, change).config, "LOOPR");
    expect(loop.presets).toHaveLength(1);
  });

  it("goes back from some ways in and somewhere fixed from others, sharing a copy where it can", () => {
    let config = sharedLooper();
    for (const main of ["MAIN1", "MAIN2"]) {
      config = applied(config, { fromStateId: main, controlId: A, stepNumber: 1, to: to("LOOPR") }).config;
    }
    // Back to MAIN0 and MAIN1, but from MAIN2 always to MAIN0 — which is where MAIN0's copy leads,
    // so MAIN2 shares it and only MAIN1 needs a copy.
    const change = {
      fromStateId: "LOOPR",
      controlId: A,
      stepNumber: 1,
      to: {
        kind: "byEntry" as const,
        routes: [
          { from: "MAIN0", to: back },
          { from: "MAIN1", to: back },
          { from: "MAIN2", to: to("MAIN0") },
        ],
      },
    };
    const plan = planRoute(config, change);
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.needs).toEqual([{ stateId: "LOOPR", enteredFrom: "MAIN1" }]);
    config = applied(config, change, spares(config, 1)).config;
    const loop = find(config, "LOOPR");
    expect(loop.presets).toHaveLength(2);
    expect(loop.state.transitions[0]!.to).toEqual(change.to);
  });

  it("stops going back, keeping one preset and freeing the rest", () => {
    const config = compiled(looper(2));
    const loop = find(config, "LOOPR");
    const change = { fromStateId: loop.id, controlId: A, stepNumber: 1, to: to("MAIN0") };
    const plan = planRoute(config, change);
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.freed).toHaveLength(1);
    const result = applied(config, change);
    const after = find(result.config, "LOOPR");
    expect(after.presets).toHaveLength(1);
    expect(isSparePreset(result.config.presets[plan.freed[0]!])).toBe(true);
    // Both mains now open the one that's left.
    for (const main of ["MAIN0", "MAIN1"]) {
      expect(jumpTarget(result.config, find(result.config, main).presets[0]!, A, 1)).toBe(after.presets[0]);
    }
  });

  it("frees the copy a way in no longer needs when the route is taken away", () => {
    const config = compiled(looper(2));
    const result = applied(config, { fromStateId: "MAIN1", controlId: A, stepNumber: 1 });
    expect(result.freed).toHaveLength(1);
    const loop = find(result.config, "LOOPR");
    expect(loop.presets).toHaveLength(1);
  });

  it("enters a state that goes back with a new copy for the new way in", () => {
    const config = compiled(looper(3));
    const change = { fromStateId: "MAIN2", controlId: B, stepNumber: 1, to: to("LOOPR") };
    const plan = planRoute(config, change);
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.needs).toEqual([{ stateId: "LOOPR", enteredFrom: "MAIN2" }]);
    const [slot] = spares(config, 1);
    const result = applied(config, change, [slot!]);
    const m2 = find(result.config, "MAIN2").presets[0]!;
    expect(find(result.config, "LOOPR").presets).toHaveLength(3);
    expect(jumpTarget(result.config, m2, B, 1)).toBe(slot);
    expect(jumpTarget(result.config, slot!, A, 1)).toBe(m2);
  });

  it("enters a state with a table, sharing an existing copy when told where its switches go from here", () => {
    let config = sharedLooper();
    for (const main of ["MAIN1", "MAIN2"]) {
      config = applied(config, { fromStateId: main, controlId: A, stepNumber: 1, to: to("LOOPR") }).config;
    }
    config = applied(
      config,
      {
        fromStateId: "LOOPR",
        controlId: A,
        stepNumber: 1,
        to: {
          kind: "byEntry",
          routes: [
            { from: "MAIN0", to: back },
            { from: "MAIN1", to: back },
            { from: "MAIN2", to: to("MAIN0") },
          ],
        },
      },
      spares(config, 1),
    ).config;
    // MAIN3 comes in, and from MAIN3 LOOPR's A should go to MAIN0, like MAIN2's: no new copy.
    const change = {
      fromStateId: "MAIN3",
      controlId: A,
      stepNumber: 1,
      to: to("LOOPR"),
      entering: { [`${A}:1`]: to("MAIN0") },
    };
    expect(planRoute(config, change)).toEqual({ ok: true, needs: [], freed: [] });
    // Told to go back from MAIN3 instead, it needs one.
    const backPlan = planRoute(config, { ...change, entering: { [`${A}:1`]: back } });
    expect(backPlan.ok && backPlan.needs).toEqual([{ stateId: "LOOPR", enteredFrom: "MAIN3" }]);
  });

  it("nests: a returning state inside another gets a copy per copy of the outer one", () => {
    // MAIN2 plays a tuner: opened from the looper on B, and going back to whichever looper copy
    // opened it. Each looper copy then needs its own tuner copy.
    let config = compiled(looper(3));
    config = applied(config, { fromStateId: "LOOPR", controlId: B, stepNumber: 1, to: to("MAIN2") }).config;
    const change = { fromStateId: "MAIN2", controlId: A, stepNumber: 1, to: back };
    const plan = planRoute(config, change);
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.needs).toEqual([{ stateId: "MAIN2", enteredFrom: "LOOPR" }]);
    config = applied(config, change, spares(config, 1)).config;

    const machine = recoverMachine(config);
    expect(machine.notes).toEqual([]);
    const loop = machine.states.find((s) => s.name === "LOOPR")!;
    const tuner = machine.states.find((s) => s.name === "MAIN2")!;
    expect(loop.transitions.find((t) => t.controlId === A)?.to).toEqual(back);
    expect(tuner.transitions.find((t) => t.controlId === A)?.to).toEqual(back);
    expect(machine.members[tuner.id]).toHaveLength(2);

    // A new way into the looper cascades: a looper copy for it, and a tuner copy for that.
    const deeper = compileMachine({
      states: [
        ...[0, 1, 2].map((i) => ({
          id: `m${i}`,
          name: `MAIN${i}`,
          body: body(60 + i),
          transitions: i < 2 ? [{ controlId: A, stepNumber: 1, to: to("loop") }] : [],
        })),
        {
          id: "loop",
          name: "LOOPR",
          body: body(99),
          transitions: [
            { controlId: A, stepNumber: 1, to: back },
            { controlId: B, stepNumber: 1, to: to("tuner") },
          ],
        },
        { id: "tuner", name: "TUNER", body: body(98), transitions: [{ controlId: A, stepNumber: 1, to: back }] },
      ],
    });
    if (!deeper.ok) throw new Error(deeper.error);
    const enter = { fromStateId: "MAIN2", controlId: A, stepNumber: 1, to: to("LOOPR") };
    const cascade = planRoute(deeper.config, enter);
    expect(cascade.ok && cascade.needs).toEqual([
      { stateId: "LOOPR", enteredFrom: "MAIN2" },
      { stateId: "TUNER", enteredFrom: "LOOPR" },
    ]);
    const after = recoverMachine(applied(deeper.config, enter, spares(deeper.config, 2)).config);
    expect(after.notes).toEqual([]);
    expect(after.members["LOOPR"]).toHaveLength(3);
    expect(after.members["TUNER"]).toHaveLength(3);
  });

  it("refuses a route from a state to itself", () => {
    const config = compiled(looper(2));
    const result = editRoute(config, { fromStateId: "MAIN0", controlId: B, stepNumber: 1, to: to("MAIN0") });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Preset Select → Current/);
  });

  it("won't let a copy take a preset the machine already uses", () => {
    const config = compiled(looper(3));
    const result = editRoute(config, { fromStateId: "MAIN2", controlId: B, stepNumber: 1, to: to("LOOPR") }, [
      find(config, "MAIN2").presets[0]!,
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/presets this machine uses/);
  });

  it("offers presets to clear for a copy, but only ones the machine doesn't use", () => {
    /*
     * A device has no empty preset until one's been cleared — the factory set fills all 24 — so
     * a copy has to be able to take one that's in use. Not one a route leads to or from, though:
     * clearing that would change the machine the route was priced on.
     */
    const factory = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
    expect(spares(factory, 24)).toEqual([]);
    expect(clearablePresets(factory, recoverMachine(factory)).length).toBeGreaterThan(0);

    const config = sharedLooper();
    const { machine } = find(config, "MAIN0");
    const offered = clearablePresets(config, machine, [find(config, "MAIN2").id]);
    // MAIN0 has a route and LOOPR is entered; MAIN2 is the state the route is about; the rest are empty.
    expect(offered).toEqual([...find(config, "MAIN1").presets, ...find(config, "MAIN3").presets]);
  });

  it("clears a preset for a copy even when that renames the state the route leaves", () => {
    /*
     * An id is the state's name, qualified by its slot only while another state shares the name.
     * D6 here is a second, different "MAIN2", so the one in the route is "MAIN2 (A3)" until D6 is
     * cleared and plain "MAIN2" after. The route has to follow the state, not the spelling.
     */
    const base = compiled(looper(3));
    const D6 = userPresetIndex(3, 6);
    const config: PacerConfig = {
      ...base,
      presets: { ...base.presets, [D6]: { index: D6, name: "MAIN2", controls: body(70), midiSettings: {} } },
    };
    const from = recoverMachine(config).states.find((s) => s.id.startsWith("MAIN2 (") && !s.id.includes("D6"))!;
    const change: RouteChange = { fromStateId: from.id, controlId: B, stepNumber: 1, to: to("LOOPR") };

    const result = editRoute(config, change, [D6], { clearing: [D6] });
    if (!result.ok) throw new Error(result.error);
    expect(find(result.config, "LOOPR").presets).toContain(D6);
    expect(find(result.config, "MAIN2").presets).toHaveLength(1);

    // And never a preset a route leads to or from, whoever asks.
    const refused = editRoute(config, change, [D6], { clearing: [find(config, "MAIN0").presets[0]!] });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toMatch(/part of a route/);
  });

  it("takes away a route that nothing depends on, leaving the step unused", () => {
    const config = compiled(looper(2));
    const loop = find(config, "LOOPR");
    const added = applied(config, { fromStateId: loop.id, controlId: B, stepNumber: 1, to: to("MAIN0") }).config;
    const result = applied(added, { fromStateId: loop.id, controlId: B, stepNumber: 1 });
    for (const copy of loop.presets) {
      const step = result.config.presets[copy]?.controls[B]?.steps[1];
      expect(step?.msgType).toBe(SwitchMessageType.Off);
    }
    expect(find(result.config, "LOOPR").state.transitions.some((t) => t.controlId === B)).toBe(false);
  });

  it("refuses a route that would sit behind an earlier jump and never fire", () => {
    const config = compiled(looper(2));
    const result = editRoute(config, { fromStateId: "MAIN0", controlId: A, stepNumber: 2, to: to("MAIN1") });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/only takes the first jump/);
  });

  it("empties a switch when asked, so a route can take one that's already busy", () => {
    const config = compiled(looper(2));
    const loop = find(config, "LOOPR");
    // Stomp 1 sends a note on every copy; replacing it leaves only the route.
    const result = applied(config, {
      fromStateId: loop.id,
      controlId: ControlId.Stompswitch1,
      stepNumber: 1,
      to: to("MAIN0"),
      replace: true,
    });
    for (const copy of loop.presets) {
      expect(jumpTarget(result.config, copy, ControlId.Stompswitch1, 1)).toBe(find(config, "MAIN0").presets[0]);
    }
  });

  it("says what each switch already carries, so a route can be put somewhere free", () => {
    const config = compiled(looper(2));
    const uses = switchUses(config, "MAIN0");
    const a = uses.find((u) => u.controlId === A)!;
    expect(a.route?.toStateId).toBe("LOOPR");
    const b = uses.find((u) => u.controlId === B)!;
    expect(b.route).toBeUndefined();
    expect(b.freeStep).toBe(1);
  });

  it("moves a route from one switch to another in one edit", () => {
    const config = compiled(looper(2));
    const home = find(config, "MAIN0").presets[0]!;
    const result = applied(config, {
      fromStateId: "MAIN0",
      controlId: B,
      stepNumber: 1,
      to: to("LOOPR"),
      moveFrom: { controlId: A, stepNumber: 1 },
    });
    expect(result.config.presets[home]?.controls[A]?.steps[1]?.msgType).toBe(SwitchMessageType.Off);
    // Still MAIN0's own copy, which still comes back to it.
    const copy = jumpTarget(result.config, home, B, 1)!;
    expect(jumpTarget(result.config, copy, A, 1)).toBe(home);
    expect(find(result.config, "LOOPR").presets).toHaveLength(2);
  });

  it("costs nothing to keep a route as it is, even into a state that comes back", () => {
    const config = compiled(looper(2));
    for (const main of ["MAIN0", "MAIN1"]) {
      const change = { fromStateId: main, controlId: A, stepNumber: 1, to: to("LOOPR") };
      expect(planRoute(config, change)).toEqual({ ok: true, needs: [], freed: [] });
      expect(applied(config, change).config.presets).toEqual(config.presets);
    }
  });

  it("moves a preset to another slot, and everything that led to it follows", () => {
    /*
     * A state's copies land wherever there was room, which is rarely where you'd have put them.
     * Moving one has to take its entrants with it, or the route that entered it lands on an empty
     * preset and the design is quietly broken.
     */
    const config = compiled(looper(2));
    const before = recoverMachine(config);
    const loop = before.states.find((s) => s.name === "LOOPR")!;
    const copy = before.members[loop.id]![0]!;
    const entrant = before.members[before.states.find((s) => s.name === "MAIN0")!.id]![0]!;
    const free = userPresetIndex(3, 6); // D6, untouched by the compiled machine

    const result = movePreset(config, copy, free);
    if (!result.ok) throw new Error(result.error);

    expect(result.config.presets[free]?.name?.trim()).toBe("LOOPR");
    expect(isSparePreset(result.config.presets[copy])).toBe(true);
    expect(jumpTarget(result.config, entrant, ControlId.StompswitchA, 1)).toBe(free); // its way in followed
    expect(jumpTarget(result.config, free, ControlId.StompswitchA, 1)).toBe(entrant); // and its way back

    const after = recoverMachine(result.config);
    const moved = after.states.find((s) => s.name === "LOOPR")!;
    expect(after.members[moved.id]).toHaveLength(2);
    expect(moved.transitions.some((t) => t.to.kind === "return")).toBe(true);
  });

  it("moves a preset on a real device, where its neighbours step to it", () => {
    /*
     * Every factory preset's C and D step to its neighbours, and a move deliberately leaves that
     * alone — next/previous names a direction, not a preset. The check that the design survived has
     * to leave it alone too, or no preset on a real device could ever be moved.
     */
    const factory = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
    const D6 = userPresetIndex(3, 6);
    const room = clearPreset(factory, D6);

    const result = movePreset(room, userPresetIndex(0, 1), D6);
    if (!result.ok) throw new Error(result.error);
    expect(result.config.presets[D6]?.name).toBe(factory.presets[userPresetIndex(0, 1)]?.name);
  });

  it("won't move a preset onto one that has something in it", () => {
    const config = compiled(looper(2));
    const machine = recoverMachine(config);
    const loop = machine.states.find((s) => s.name === "LOOPR")!;
    const occupied = machine.members[machine.states.find((s) => s.name === "MAIN1")!.id]![0]!;

    const result = movePreset(config, machine.members[loop.id]![0]!, occupied);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Clear it first/);
  });
});
