import { describe, expect, it } from "vitest";
import { compileMachine } from "../../../test/compileMachine";
import { recoverMachine, type MachineState, type StateMachine } from "../../analysis";
import { ControlId, SwitchMessageType, presetSelectTargetToIndex, userPresetIndex } from "../../protocol/constants";
import type { PacerConfig, Preset } from "../../protocol/types";
import { readFileSync } from "node:fs";
import { clearPreset, isSparePreset } from "../../editing";
import { decodeSysex } from "../../protocol/decode";
import { editRoute, movePreset, planRoute, switchUses } from "..";

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

  it("prices entering a state that comes back: one preset per place it's entered from", () => {
    const config = compiled(looper(3));
    const machine = recoverMachine(config);
    const loop = machine.states.find((s) => s.name === "LOOPR")!;
    const spare = machine.states.find((s) => s.name === "MAIN2")!;
    const change = { fromStateId: spare.id, controlId: ControlId.StompswitchB, stepNumber: 1, toStateId: loop.id };

    const plan = planRoute(config, change);
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.copies).toHaveLength(1); // MAIN2 is one preset, so one more copy of LOOPR
    expect(plan.copies[0]!.name).toBe("LOOPR");
    // Without somewhere to put it, it says so rather than picking a preset itself.
    expect(editRoute(config, change).ok).toBe(false);

    const free = userPresetIndex(0, 6); // A6: the compiled machine only used A1-A5
    const result = editRoute(config, change, [free]);
    if (!result.ok) throw new Error(result.error);

    const after = recoverMachine(result.config);
    const nowLoop = after.states.find((s) => s.name === "LOOPR")!;
    expect(after.members[nowLoop.id]).toHaveLength(3); // the copy joined the state, not a new one
    expect(nowLoop.transitions.some((t) => t.to.kind === "return")).toBe(true);
    // The new copy comes back to the preset that now enters it.
    expect(jumpTarget(result.config, free, ControlId.StompswitchA, 1)).toBe(machine.members[spare.id]![0]);
    expect(jumpTarget(result.config, machine.members[spare.id]![0]!, ControlId.StompswitchB, 1)).toBe(free);
  });

  it("asks whether a state entered from one place comes back, since the presets can't say", () => {
    /*
     * While a state is entered from one place, "comes back to wherever it was entered from" and
     * "goes to A1" are the same preset. A second way in is the moment that has an answer, so it's
     * asked: joining what's there costs nothing, and coming back costs a preset.
     */
    const single = compileMachine({
      states: [
        {
          id: "m0",
          name: "MAIN0",
          body: body(60),
          transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "state", id: "loop" } }],
        },
        { id: "m1", name: "MAIN1", body: body(61), transitions: [] },
        {
          id: "loop",
          name: "LOOPR",
          body: body(99),
          transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "return" } }],
        },
      ],
    });
    if (!single.ok) throw new Error(single.error);

    const machine = recoverMachine(single.config);
    const loop = machine.states.find((s) => s.name === "LOOPR")!;
    const other = machine.states.find((s) => s.name === "MAIN1")!;
    const change = { fromStateId: other.id, controlId: ControlId.StompswitchB, stepNumber: 1, toStateId: loop.id };

    const asked = planRoute(single.config, change);
    if (!asked.ok) throw new Error(asked.error);
    expect(asked.copies).toHaveLength(0);
    expect(asked.choice?.backTo).toBe(machine.members[machine.states.find((s) => s.name === "MAIN0")!.id]![0]);

    // Said yes: a copy, and MAIN1 gets its own way back.
    const priced = planRoute(single.config, { ...change, asReturn: true });
    if (!priced.ok) throw new Error(priced.error);
    expect(priced.copies).toHaveLength(1);

    const free = userPresetIndex(0, 6);
    const result = editRoute(single.config, { ...change, asReturn: true }, [free]);
    if (!result.ok) throw new Error(result.error);
    const after = recoverMachine(result.config);
    const nowLoop = after.states.find((s) => s.name === "LOOPR")!;
    expect(after.members[nowLoop.id]).toHaveLength(2);
    expect(nowLoop.transitions.some((t) => t.to.kind === "return")).toBe(true); // now it reads as one
  });

  it("gives every origin its own copy when a shared one is asked to come back", () => {
    /*
     * The shape a real device ends up in: two presets both jump to one looper, so its way back can
     * only lead to one of them. Saying it comes back means a copy per origin — the one that's
     * there keeps the origin it already leads to, and the preset that was sharing it is pointed at
     * a copy of its own.
     */
    const shared = compileMachine({
      states: [
        {
          id: "m0",
          name: "MAIN0",
          body: body(60),
          transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "state", id: "loop" } }],
        },
        { id: "m1", name: "MAIN1", body: body(61), transitions: [] },
        { id: "m2", name: "MAIN2", body: body(62), transitions: [] },
        {
          id: "loop",
          name: "LOOPR",
          body: body(99),
          transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "return" } }],
        },
      ],
    });
    if (!shared.ok) throw new Error(shared.error);
    const first = recoverMachine(shared.config);
    const loopId = first.states.find((s) => s.name === "LOOPR")!.id;
    const loopSlot = first.members[loopId]![0]!;
    const m1 = first.members[first.states.find((s) => s.name === "MAIN1")!.id]![0]!;

    // MAIN1 jumps to the same looper preset, by hand, the way a device ends up.
    const sharing = editRoute(shared.config, {
      fromStateId: first.states.find((s) => s.name === "MAIN1")!.id,
      controlId: ControlId.StompswitchB,
      stepNumber: 1,
      toStateId: loopId,
    });
    if (!sharing.ok) throw new Error(sharing.error);

    const machine = recoverMachine(sharing.config);
    const loop = machine.states.find((s) => s.name === "LOOPR")!;
    const m2State = machine.states.find((s) => s.name === "MAIN2")!;
    expect(machine.members[loop.id]).toHaveLength(1); // still one preset, shared by two origins

    const change = {
      fromStateId: m2State.id,
      controlId: ControlId.StompswitchB,
      stepNumber: 1,
      toStateId: loop.id,
      asReturn: true,
    };
    const plan = planRoute(sharing.config, change);
    if (!plan.ok) throw new Error(plan.error);
    // One for MAIN2's way in, one for MAIN1, which has been sharing; MAIN0 keeps the original.
    expect(plan.copies.map((c) => c.entryFrom)).toEqual([machine.members[m2State.id]![0], m1]);
    expect(plan.copies[1]!.repoint).toBeDefined();

    const slots = [userPresetIndex(0, 5), userPresetIndex(0, 6)];
    const result = editRoute(sharing.config, change, slots);
    if (!result.ok) throw new Error(result.error);

    const after = recoverMachine(result.config);
    const nowLoop = after.states.find((s) => s.name === "LOOPR")!;
    expect(after.members[nowLoop.id]).toHaveLength(3);
    expect(nowLoop.transitions.some((t) => t.to.kind === "return")).toBe(true);
    // MAIN1 now goes to its own copy, and that copy comes back to MAIN1.
    expect(jumpTarget(result.config, m1, ControlId.StompswitchB, 1)).toBe(slots[1]);
    expect(jumpTarget(result.config, slots[1]!, ControlId.StompswitchA, 1)).toBe(m1);
    // And the original still serves MAIN0.
    expect(jumpTarget(result.config, loopSlot, ControlId.StompswitchA, 1)).toBe(
      first.members[first.states.find((s) => s.name === "MAIN0")!.id]![0],
    );
  });

  it("won't let a copy take a preset the route runs between", () => {
    const config = compiled(looper(3));
    const machine = recoverMachine(config);
    const loop = machine.states.find((s) => s.name === "LOOPR")!;
    const spare = machine.states.find((s) => s.name === "MAIN2")!;

    const result = editRoute(
      config,
      { fromStateId: spare.id, controlId: ControlId.StompswitchB, stepNumber: 1, toStateId: loop.id },
      [machine.members[spare.id]![0]!],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/presets this route runs between/);
  });

  it("refuses a route from a state to itself", () => {
    const config = compiled(looper(2));
    const machine = recoverMachine(config);
    const main = machine.states.find((s) => s.name === "MAIN0")!;

    const result = editRoute(config, {
      fromStateId: main.id,
      controlId: ControlId.StompswitchB,
      stepNumber: 1,
      toStateId: main.id,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Preset Select → Current/);
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

  it("refuses a route that would sit behind an earlier jump and never fire", () => {
    // The shape every factory preset has: switch A already selects the firmware's Track preset,
    // which the map can't show because it isn't a state of the configuration.
    const config = compiled(looper(2));
    const machine = recoverMachine(config);
    const a = machine.states.find((s) => s.name === "MAIN0")!;
    const b = machine.states.find((s) => s.name === "MAIN1")!;

    const result = editRoute(config, {
      fromStateId: a.id,
      controlId: ControlId.StompswitchA, // already jumps to the looper on step 1
      stepNumber: 2,
      toStateId: b.id,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/only takes the first jump/);
  });

  it("empties a switch when asked, so a route can take one that's already busy", () => {
    /*
     * The usual case on a real device: switch A already selects the firmware's Track preset, so
     * nothing could be routed onto it. Saying "replace what's on it" clears the switch on every
     * preset the state is, and the route becomes all it does.
     */
    const design = looper(2);
    // The looper's A also sends a note, so there's something on the switch besides the way back.
    design.states.find((s) => s.id === "loop")!.body[ControlId.StompswitchA] = {
      steps: { 2: { channel: 0, msgType: SwitchMessageType.Note, data: [40, 127, 0], active: true } },
      led: {},
    };
    const config = compiled(design);
    const machine = recoverMachine(config);
    const loop = machine.states.find((s) => s.name === "LOOPR")!;
    const main = machine.states.find((s) => s.name === "MAIN0")!;
    const busy = { fromStateId: loop.id, controlId: ControlId.StompswitchA, stepNumber: 2, toStateId: main.id };

    expect(editRoute(config, busy).ok).toBe(false); // step 1 already jumps: a route on 2 never fires

    const result = editRoute(config, { ...busy, stepNumber: 1, replace: true });
    if (!result.ok) throw new Error(result.error);
    const home = machine.members[main.id]![0]!;
    for (const copy of machine.members[loop.id]!) {
      expect(jumpTarget(result.config, copy, ControlId.StompswitchA, 1)).toBe(home);
      // What used to be there is gone, not left behind on a later step.
      expect(result.config.presets[copy]?.controls[ControlId.StompswitchA]?.steps[2]?.msgType).toBe(
        SwitchMessageType.Off,
      );
    }
  });

  it("says what each switch already carries, so a route can be put somewhere free", () => {
    const config = compiled(looper(2));
    const machine = recoverMachine(config);
    const loop = machine.states.find((s) => s.name === "LOOPR")!;

    const uses = switchUses(config, loop.id);
    const a = uses.find((u) => u.controlId === ControlId.StompswitchA)!;
    expect(a.route?.isReturn).toBe(true);
    expect(a.route?.stepNumber).toBe(1);
    // Nowhere to put a second route: a press fires every step but takes only the first jump, so
    // anything after the return on step 1 would sit there and never happen.
    expect(a.freeStep).toBeUndefined();

    const one = uses.find((u) => u.controlId === ControlId.Stompswitch1)!;
    expect(one.route).toBeUndefined();
    expect(one.sends).toBe(1); // the state's body: a note on stomp 1
    expect(one.freeStep).toBe(2);
  });

  it("moves a route from one switch to another in one edit", () => {
    const config = compiled(looper(2));
    const machine = recoverMachine(config);
    const main = machine.states.find((s) => s.name === "MAIN0")!;
    const loop = machine.states.find((s) => s.name === "LOOPR")!;
    const home = machine.members[main.id]![0]!;

    // A carries the route today; B takes it over, and A is left doing nothing.
    const result = editRoute(config, {
      fromStateId: main.id,
      controlId: ControlId.StompswitchB,
      stepNumber: 1,
      toStateId: loop.id,
      moveFrom: { controlId: ControlId.StompswitchA, stepNumber: 1 },
    });
    if (!result.ok) throw new Error(result.error);

    expect(jumpTarget(result.config, home, ControlId.StompswitchB, 1)).toBe(machine.members[loop.id]![0]);
    expect(result.config.presets[home]?.controls[ControlId.StompswitchA]?.steps[1]?.msgType).toBe(
      SwitchMessageType.Off,
    );
    // Still one route to the looper, on the switch it was moved to.
    const after = recoverMachine(result.config);
    const moved = after.states.find((s) => (after.members[s.id] ?? []).includes(home))!;
    expect(moved.transitions.map((t) => t.controlId)).toEqual([ControlId.StompswitchB]);
  });

  it("moves a route into a state that comes back, keeping each way in on its own copy", () => {
    // MAIN1 enters the looper's second copy; moving its route must not aim it at the first.
    const config = compiled(looper(2));
    const machine = recoverMachine(config);
    const main = machine.states.find((s) => s.name === "MAIN1")!;
    const loop = machine.states.find((s) => s.name === "LOOPR")!;
    const home = machine.members[main.id]![0]!;
    const own = jumpTarget(config, home, ControlId.StompswitchA, 1);

    const result = editRoute(config, {
      fromStateId: main.id,
      controlId: ControlId.StompswitchB,
      stepNumber: 1,
      toStateId: loop.id,
      moveFrom: { controlId: ControlId.StompswitchA, stepNumber: 1 },
    });
    if (!result.ok) throw new Error(result.error);
    expect(jumpTarget(result.config, home, ControlId.StompswitchB, 1)).toBe(own);
  });

  it("costs nothing to keep a route as it is, even into a state that comes back", () => {
    // Opening a route and confirming it unchanged isn't a new way in.
    const config = compiled(looper(2));
    const machine = recoverMachine(config);
    const loop = machine.states.find((s) => s.name === "LOOPR")!;
    for (const name of ["MAIN0", "MAIN1"]) {
      const main = machine.states.find((s) => s.name === name)!;
      const change = {
        fromStateId: main.id,
        controlId: ControlId.StompswitchA,
        stepNumber: 1,
        toStateId: loop.id,
      };
      expect(planRoute(config, change)).toEqual({ ok: true, copies: [] });
      const result = editRoute(config, change);
      if (!result.ok) throw new Error(result.error);
      expect(result.config.presets).toEqual(config.presets);
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
