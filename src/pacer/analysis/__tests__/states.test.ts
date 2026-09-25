import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ControlId,
  SwitchMessageType,
  presetIndexToPresetSelectTarget,
  userPresetIndex,
} from "../../protocol/constants";
import { decodeSysex } from "../../protocol/decode";
import { createEmptyPacerConfig, getOrCreateControl, getOrCreatePreset } from "../../protocol/types";
import type { PacerConfig } from "../../protocol/types";
import { presetStates } from "../states";
import { presetTransitions } from "../transitions";

const factory = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
const at = (bank: number, n: number) => userPresetIndex(bank, n);

function step(preset: number, controlId: number, n: number, msgType: number, data: [number, number, number]) {
  return { preset, controlId, n, msgType, data };
}

function build(steps: ReturnType<typeof step>[], names: Partial<Record<number, string>> = {}): PacerConfig {
  const config = createEmptyPacerConfig();
  for (const s of steps) {
    const preset = getOrCreatePreset(config, s.preset);
    preset.name = names[s.preset] ?? preset.name;
    getOrCreateControl(preset, s.controlId).steps[s.n] = {
      channel: 0,
      msgType: s.msgType,
      data: s.data,
      active: true,
    };
  }
  return config;
}

/**
 * The shape this project exists to undo: one "looper running" state that has to be duplicated per
 * origin, because the hardware has nowhere else to remember which preset it came from. Twelve
 * main presets on banks A and B, each with a looper preset on C and D that returns to it.
 */
function loopWithTwelveOrigins(): { config: PacerConfig; mains: number[]; loopers: number[] } {
  const mains: number[] = [];
  const loopers: number[] = [];
  const steps: ReturnType<typeof step>[] = [];
  const names: Partial<Record<number, string>> = {};
  for (let i = 0; i < 12; i++) {
    const main = at(Math.floor(i / 6), (i % 6) + 1);
    const looper = at(2 + Math.floor(i / 6), (i % 6) + 1);
    mains.push(main);
    loopers.push(looper);
    names[main] = `MAIN${i}`.slice(0, 5);
    names[looper] = "LOOPR";
    // Main: switch A starts the looper and goes to its own looper preset.
    steps.push(step(main, ControlId.StompswitchA, 1, SwitchMessageType.CcToggle, [52, 127, 0]));
    steps.push(
      step(main, ControlId.StompswitchA, 2, SwitchMessageType.PresetSelect, [
        presetIndexToPresetSelectTarget(looper),
        0,
        0,
      ]),
    );
    // Looper: identical everywhere except the preset it returns to.
    steps.push(step(looper, ControlId.Stompswitch1, 1, SwitchMessageType.CcTrigger, [53, 127, 0]));
    steps.push(
      step(looper, ControlId.StompswitchA, 1, SwitchMessageType.PresetSelect, [
        presetIndexToPresetSelectTarget(main),
        0,
        0,
      ]),
    );
  }
  return { config: build(steps, names), mains, loopers };
}

describe("presets that are really one state", () => {
  it("recovers twelve duplicated looper presets as a single state", () => {
    const { config, mains, loopers } = loopWithTwelveOrigins();
    const states = presetStates(config);

    // Two states of twelve: the loopers, and the mains — which also differ only in where they
    // lead, so the same rule collapses them too.
    expect(states).toHaveLength(2);
    const looperState = states.find((s) => s.members.includes(loopers[0]!));
    expect(looperState?.members).toEqual(loopers);
    expect(looperState?.name).toBe("LOOPR"); // the only name the dump can carry for a state

    const mainState = states.find((s) => s.members.includes(mains[0]!));
    expect(mainState?.members).toEqual(mains);
    expect(mainState?.name).toBeUndefined(); // each main keeps its own name
  });

  it("keeps the twelve return routes, which is what the duplication was for", () => {
    const { config, mains, loopers } = loopWithTwelveOrigins();
    const graph = presetTransitions(config);
    // Each looper instance returns to its own origin: one state, twelve destinations.
    const returns = loopers.map((l) => (graph.from[l] ?? []).map((e) => e.target));
    expect(returns).toEqual(mains.map((m) => [{ kind: "preset", index: m }]));
  });

  it("doesn't group presets that differ in anything but where they lead", () => {
    const a = at(0, 1);
    const b = at(0, 2);
    // Same switch, same kind of step, different CC number: different behaviour, two states.
    const different = build([
      step(a, ControlId.Stompswitch1, 1, SwitchMessageType.CcToggle, [52, 127, 0]),
      step(b, ControlId.Stompswitch1, 1, SwitchMessageType.CcToggle, [53, 127, 0]),
    ]);
    expect(presetStates(different).map((s) => s.members)).toEqual([[a], [b]]);

    // A preset missing the switch altogether isn't the same state as one that has it.
    const missing = build([step(a, ControlId.Stompswitch1, 1, SwitchMessageType.PresetSelect, [5, 0, 0])]);
    getOrCreatePreset(missing, b);
    expect(presetStates(missing).map((s) => s.members)).toEqual([[a], [b]]);
  });

  it("names a state only when its members agree", () => {
    const a = at(0, 1);
    const b = at(0, 2);
    const config = build(
      [
        step(a, ControlId.StompswitchA, 1, SwitchMessageType.PresetSelect, [5, 0, 0]),
        step(b, ControlId.StompswitchA, 1, SwitchMessageType.PresetSelect, [6, 0, 0]),
      ],
      { [a]: "LOOP1", [b]: "LOOP2" },
    );
    const [state] = presetStates(config);
    expect(state?.members).toEqual([a, b]);
    expect(state?.name).toBeUndefined();
  });

  it("finds the factory dump's own duplication", () => {
    // The factory set is four banks of variations, so some presets really are interchangeable
    // apart from where they lead — the grouping should be fewer states than presets.
    const states = presetStates(factory);
    const presets = Object.keys(factory.presets).length;
    expect(states.length).toBeLessThan(presets);
    expect(states.reduce((n, s) => n + s.members.length, 0)).toBe(presets);
  });
});
