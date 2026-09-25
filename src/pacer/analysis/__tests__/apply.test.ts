import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ControlId,
  SwitchMessageType,
  presetIndexToPresetSelectTarget,
  userPresetIndex,
} from "../../protocol/constants";
import { decodeSysex } from "../../protocol/decode";
import { getOrCreateControl, getOrCreatePreset } from "../../protocol/types";
import type { Preset } from "../../protocol/types";
import { applyMachine, slotUsage } from "../apply";
import type { MachineState, StateMachine } from "../machine";
import { recoverMachine } from "../recover";

const factory = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));

const body = (note: number): Preset["controls"] => ({
  [ControlId.Stompswitch1]: {
    steps: { 1: { channel: 0, msgType: SwitchMessageType.Note, data: [note, 127, 0], active: true } },
    led: {},
  },
});

/** Two mains entering one looper that returns: four presets, the smallest design that needs copies. */
function looper(): StateMachine {
  const mains: MachineState[] = [0, 1].map((i) => ({
    id: `m${i}`,
    name: `MAIN${i}`,
    body: body(60 + i),
    transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "state", id: "loop" } }],
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

describe("putting a machine into a configuration that already exists", () => {
  it("keeps the global settings and the presets it doesn't need", () => {
    const applied = applyMachine(factory, looper());
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    expect(applied.config.globalFields).toBe(factory.globalFields); // settings are not the machine's business
    const { used, untouched } = slotUsage(applied);
    expect(used).toHaveLength(4);
    for (const slot of untouched) {
      expect(applied.config.presets[slot]).toBe(factory.presets[slot]); // untouched, not rebuilt
    }
    expect(applied.config.presets[used[0]!]).not.toBe(factory.presets[used[0]!]);
  });

  it("still comes back as the machine that was put in", () => {
    const machine = looper();
    const applied = applyMachine(factory, machine);
    if (!applied.ok) throw new Error(applied.error);
    const recovered = recoverMachine(applied.config);
    const loop = recovered.states.find((s) => s.name === "LOOPR")!;
    expect(recovered.members[loop.id]).toHaveLength(2);
    expect(loop.transitions[0]?.to).toEqual({ kind: "return" });
  });

  it("refuses when a preset it didn't touch reaches into the machine", () => {
    /*
     * A return is only recognisable while each copy has exactly one way in. A switch on some
     * other preset that jumps into a copy gives it a second, so the machine would land and come
     * back as something else — which is why the merge is checked, not just the compile.
     */
    const machine = looper();
    const compiled = applyMachine(factory, machine);
    if (!compiled.ok) throw new Error(compiled.error);
    const looperCopy = compiled.slots.find((s) => s.stateId === "loop")!.presetIndex;

    const meddled = structuredClone(factory);
    const intruder = getOrCreatePreset(meddled, userPresetIndex(3, 6)); // D6, which the machine never uses
    getOrCreateControl(intruder, ControlId.StompswitchB).steps[1] = {
      channel: 0,
      msgType: SwitchMessageType.PresetSelect,
      data: [presetIndexToPresetSelectTarget(looperCopy), 0, 0],
      active: true,
    };

    const applied = applyMachine(meddled, machine);
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(applied.error).toMatch(/interfering/);
  });

  it("refuses when a preset it didn't touch already behaves like one of its states", () => {
    /*
     * Presets are grouped by behaviour, so a stray preset that does what a state does joins it —
     * giving the state a copy the machine never made, and a return somewhere it was never entered
     * from. The design is fine; the configuration around it isn't.
     */
    const machine = looper();
    const compiled = applyMachine(factory, machine);
    if (!compiled.ok) throw new Error(compiled.error);
    const looperCopy = compiled.slots.find((s) => s.stateId === "loop")!.presetIndex;

    const twinIndex = userPresetIndex(3, 6); // D6, which the machine never uses
    const meddled = structuredClone(factory);
    meddled.presets[twinIndex] = { ...structuredClone(compiled.config.presets[looperCopy]!), index: twinIndex };

    const applied = applyMachine(meddled, machine);
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(applied.error).toContain("D6");
    expect(applied.error).toContain("LOOPR");
  });
});
