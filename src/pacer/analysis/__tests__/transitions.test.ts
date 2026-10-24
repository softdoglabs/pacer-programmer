// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ControlId,
  ControlMode,
  SwitchMessageType,
  presetIndexToPresetSelectTarget,
  userPresetIndex,
} from "../../protocol/constants";
import { decodeSysex } from "../../protocol/decode";
import { createEmptyPacerConfig, getOrCreateControl, getOrCreatePreset } from "../../protocol/types";
import type { PacerConfig } from "../../protocol/types";
import { presetTransitions } from "../transitions";

const factory = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
const A1 = userPresetIndex(0, 1);
const A2 = userPresetIndex(0, 2);
const B2 = userPresetIndex(1, 2);
const D6 = userPresetIndex(3, 6);

/** A config with one control on one preset, built from steps. */
function withControl(
  presetIndex: number,
  controlId: number,
  steps: { msgType: number; data: [number, number, number]; active?: boolean }[],
  controlMode: ControlMode = ControlMode.AllStepsAtOnce,
): PacerConfig {
  const config = createEmptyPacerConfig();
  const control = getOrCreateControl(getOrCreatePreset(config, presetIndex), controlId);
  control.controlMode = controlMode;
  steps.forEach((s, i) => {
    control.steps[i + 1] = { channel: 0, msgType: s.msgType, data: s.data, active: s.active ?? true };
  });
  return config;
}

const presetSelect = (to: number) => ({
  msgType: SwitchMessageType.PresetSelect,
  data: [presetIndexToPresetSelectTarget(to), 0, 0] as [number, number, number],
});

describe("preset transitions", () => {
  it("reads a jump, and what travels with it", () => {
    // The project's own example: one press activates the looper and moves to the preset that
    // represents "looper running", which is the only way the Pacer can remember it did.
    const config = withControl(A1, ControlId.StompswitchA, [
      { msgType: SwitchMessageType.ProgramAndBank, data: [5, 0, 0] },
      presetSelect(B2),
    ]);
    const { edges } = presetTransitions(config);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      from: A1,
      controlId: ControlId.StompswitchA,
      stepNumber: 2,
      target: { kind: "preset", index: B2 },
      trigger: { kind: "press" },
    });
    expect(edges[0]!.alsoFires).toEqual([
      { stepNumber: 1, step: expect.objectContaining({ msgType: SwitchMessageType.ProgramAndBank }) },
    ]);
  });

  it("resolves Preset Inc/Dec per preset, wrapping at both ends", () => {
    const next = withControl(D6, ControlId.StompswitchD, [
      { msgType: SwitchMessageType.PresetIncDec, data: [0, 0, 0] },
    ]);
    expect(presetTransitions(next).edges[0]!.target).toEqual({ kind: "preset", index: A1 });

    const previous = withControl(A1, ControlId.StompswitchC, [
      { msgType: SwitchMessageType.PresetIncDec, data: [1, 0, 0] },
    ]);
    expect(presetTransitions(previous).edges[0]!.target).toEqual({ kind: "preset", index: D6 });
  });

  it("keeps the reserved targets apart from user presets", () => {
    const config = withControl(A1, ControlId.StompswitchA, [
      { msgType: SwitchMessageType.PresetSelect, data: [0, 0, 0] }, // reload
    ]);
    expect(presetTransitions(config).edges[0]!.target).toEqual({ kind: "reload" });

    const daw = withControl(A1, ControlId.StompswitchB, [{ msgType: SwitchMessageType.PresetSelect, data: [2, 0, 0] }]);
    expect(presetTransitions(daw).edges[0]!.target).toEqual({ kind: "special", preset: "transport" });
  });

  it("takes only the first jump of an all-at-once press, as the engine does", () => {
    const config = withControl(A1, ControlId.StompswitchA, [presetSelect(B2), presetSelect(A2)]);
    const { edges } = presetTransitions(config);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.target).toEqual({ kind: "preset", index: B2 });
  });

  it("gives a Sequence control one edge per press, since each press leads somewhere else", () => {
    const config = withControl(
      A1,
      ControlId.StompswitchA,
      [presetSelect(A2), { msgType: SwitchMessageType.Note, data: [60, 127, 0] }, presetSelect(B2)],
      ControlMode.Sequence,
    );
    const { edges } = presetTransitions(config);
    expect(edges.map((e) => [e.trigger, e.target])).toEqual([
      [
        { kind: "sequencePosition", position: 1 },
        { kind: "preset", index: A2 },
      ],
      [
        { kind: "sequencePosition", position: 3 },
        { kind: "preset", index: B2 },
      ],
    ]);
    expect(edges.every((e) => e.alsoFires.length === 0)).toBe(true);
  });

  it("ignores inactive steps, and controls that only send", () => {
    const inactive = withControl(A1, ControlId.StompswitchA, [{ ...presetSelect(B2), active: false }]);
    expect(presetTransitions(inactive).edges).toEqual([]);

    const sends = withControl(A1, ControlId.StompswitchA, [
      { msgType: SwitchMessageType.CcToggle, data: [52, 127, 0] },
    ]);
    expect(presetTransitions(sends).edges).toEqual([]);
  });

  it("indexes the factory dump both ways", () => {
    const graph = presetTransitions(factory);
    // Factory C and D step through the presets on every preset, so each one leads to its
    // neighbors and is reachable from them.
    const outOfA1 = graph.from[A1] ?? [];
    expect(outOfA1.map((e) => e.target)).toEqual(
      expect.arrayContaining([
        { kind: "preset", index: D6 }, // C: previous, wrapping
        { kind: "preset", index: A2 }, // D: next
      ]),
    );
    expect((graph.into[A1] ?? []).map((e) => e.from)).toEqual(expect.arrayContaining([A2, D6]));
    // A and B reach the firmware's DAW presets rather than any user preset.
    expect(outOfA1.map((e) => e.target)).toEqual(
      expect.arrayContaining([
        { kind: "special", preset: "track" },
        { kind: "special", preset: "transport" },
      ]),
    );
    expect(graph.edges.every((e) => e.from >= 0)).toBe(true);
  });
});
