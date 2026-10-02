import { describe, expect, it } from "vitest";
import { clearPreset, copyPreset, setStepType } from "../../editing";
import { ControlId, SwitchMessageType, userPresetIndex } from "../../protocol/constants";
import type { Preset } from "../../protocol/types";
import { compileMachine } from "../../../test/compileMachine";
import type { StateMachine } from "../model";
import { machineOf } from "../machineOf";
import { whatWasLost } from "../survives";

const body = (note: number): Preset["controls"] => ({
  [ControlId.Stompswitch1]: {
    steps: { 1: { channel: 0, msgType: SwitchMessageType.Note, data: [note, 127, 0], active: true } },
    led: {},
  },
});

/** Two mains entering one LOOPR that comes back: A1, A2 main; A3, A4 the looper's copies. */
const LOOPER: StateMachine = {
  states: [
    ...[0, 1].map((i) => ({
      id: `m${i}`,
      name: `MAIN${i}`,
      body: body(60 + i),
      transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "state" as const, id: "loop" } }],
    })),
    {
      id: "loop",
      name: "LOOPR",
      body: body(99),
      transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "return" as const } }],
    },
  ],
};

function looper() {
  const compiled = compileMachine(LOOPER);
  if (!compiled.ok) throw new Error(compiled.error);
  return compiled.config;
}

const A = (n: number) => userPresetIndex(0, n);

describe("what an edit loses", () => {
  it("reports a return that stops being one", () => {
    const config = looper();
    // Take away MAIN0's way in: its copy of LOOPR then has nothing to come back to.
    const edited = setStepType(config, A(1), ControlId.StompswitchA, 1, "switch", SwitchMessageType.Off);
    expect(whatWasLost(config, edited, { kind: "edit", steps: [] })).toMatch(/coming back/);
  });

  it("lets a return go when it was on a step the edit set out to change", () => {
    const config = looper();
    const copy = machineOf(config).members[machineOf(config).states.find((s) => s.name === "LOOPR")!.id]![0]!;
    // Changing the way-back switch itself, on purpose, on both copies.
    let edited = config;
    for (const presetIndex of [A(3), A(4)]) {
      edited = setStepType(edited, presetIndex, ControlId.StompswitchA, 1, "switch", SwitchMessageType.Off);
    }
    expect(copy).toBe(A(3));
    const steps = [A(3), A(4)].map((presetIndex) => ({
      presetIndex,
      controlId: ControlId.StompswitchA,
      stepNumber: 1,
    }));
    expect(whatWasLost(config, edited, { kind: "edit", steps })).toBeUndefined();
  });

  it("holds a renumbering to the same design, slots renamed", () => {
    const config = clearPreset(looper(), userPresetIndex(3, 6));
    const D6 = userPresetIndex(3, 6);

    // Copied and cleared, but MAIN0 still jumps to A3 — the part a move exists to get right. It's
    // caught as the most specific thing it breaks: the copy now at D6 has nothing coming back to it.
    const careless = clearPreset(copyPreset(config, A(3), D6), A(3));
    expect(whatWasLost(config, careless, { kind: "renumbering", moved: { [A(3)]: D6 } })).toMatch(/A3 coming back/);

    // Moving a main without repointing what comes back to it is caught too.
    const plain = clearPreset(looper(), D6);
    const careful = clearPreset(copyPreset(plain, A(1), D6), A(1));
    expect(whatWasLost(plain, careful, { kind: "renumbering", moved: { [A(1)]: D6 } })).toBeDefined();
  });
});
