// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { ControlId, userPresetIndex } from "../../protocol/constants";
import { PRESET_HOLD_MS, deviceModeMachine } from "../deviceModeMachine";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function start() {
  const calls: string[] = [];
  const actor = createActor(
    deviceModeMachine.provide({
      actions: {
        loadPreset: (_, { index }) => calls.push(`load ${index}`),
        returnToLastPreset: () => calls.push("return"),
        dawCommand: (_, { preset, command }) => calls.push(`${preset}: ${command}`),
      },
    }),
  ).start();
  return {
    actor,
    calls,
    sw: (controlId: number) => actor.send({ type: "SWITCH", controlId }),
    tapPreset: (currentBank = 0) => {
      actor.send({ type: "PRESET_DOWN", currentBank });
      actor.send({ type: "PRESET_UP" });
    },
    holdPreset: (currentBank = 0) => {
      actor.send({ type: "PRESET_DOWN", currentBank });
      vi.advanceTimersByTime(PRESET_HOLD_MS);
      actor.send({ type: "PRESET_UP" });
    },
    mode: () => (actor.getSnapshot().value as { mode: string }).mode,
  };
}

describe("deviceModeMachine: [Preset] tap vs hold", () => {
  it("starts on the user preset", () => {
    expect(start().mode()).toBe("user");
  });

  it("a tap on a user preset does nothing", () => {
    const { tapPreset, calls, mode } = start();
    tapPreset();
    expect(mode()).toBe("user");
    expect(calls).toEqual([]);
  });

  it("released just before the threshold is still a tap", () => {
    const { actor, mode } = start();
    actor.send({ type: "PRESET_DOWN", currentBank: 0 });
    vi.advanceTimersByTime(PRESET_HOLD_MS - 1);
    actor.send({ type: "PRESET_UP" });
    expect(mode()).toBe("user");
  });

  it("enters preset select as soon as the hold threshold passes, while still held", () => {
    const { actor, mode } = start();
    actor.send({ type: "PRESET_DOWN", currentBank: 1 });
    vi.advanceTimersByTime(PRESET_HOLD_MS);
    expect(mode()).toBe("presetSelect");
    actor.send({ type: "PRESET_UP" });
    expect(mode()).toBe("presetSelect"); // releasing after a hold isn't also a tap
  });
});

describe("deviceModeMachine: preset select", () => {
  it("a bare 1-6 loads that number in the current bank", () => {
    const { holdPreset, sw, calls, mode } = start();
    holdPreset(2);
    sw(ControlId.Stompswitch4);
    expect(calls).toEqual([`load ${userPresetIndex(2, 4)}`]); // C4
    expect(mode()).toBe("user");
  });

  it("A-D change the pending bank without leaving selection", () => {
    const { holdPreset, sw, calls, mode } = start();
    holdPreset(0);
    sw(ControlId.StompswitchD);
    sw(ControlId.StompswitchB);
    expect(mode()).toBe("presetSelect");
    sw(ControlId.Stompswitch6);
    expect(calls).toEqual([`load ${userPresetIndex(1, 6)}`]); // B6
  });

  it("a tap cancels without loading or reloading anything", () => {
    const { holdPreset, tapPreset, sw, calls, mode } = start();
    holdPreset(0);
    sw(ControlId.StompswitchD);
    tapPreset();
    expect(mode()).toBe("user");
    expect(calls).toEqual([]);
  });
});

describe("deviceModeMachine: built-in Track/Transport presets", () => {
  it("enters Track on request, sends DAW commands, and a tap returns to the last user preset", () => {
    const { actor, tapPreset, sw, calls, mode } = start();
    actor.send({ type: "ENTER_SPECIAL", preset: "track" });
    expect(mode()).toBe("track");
    sw(ControlId.Stompswitch1);
    sw(ControlId.StompswitchC);
    sw(ControlId.StompswitchD);
    expect(calls).toEqual(["track: Solo", "track: Previous track", "track: Next track"]);
    tapPreset();
    expect(mode()).toBe("user");
    expect(calls.at(-1)).toBe("return");
  });

  it("a hold from Track goes straight to preset select", () => {
    const { actor, holdPreset, sw, calls, mode } = start();
    actor.send({ type: "ENTER_SPECIAL", preset: "track" });
    holdPreset(3);
    expect(mode()).toBe("presetSelect");
    sw(ControlId.Stompswitch2);
    expect(calls).toEqual([`load ${userPresetIndex(3, 2)}`]); // D2
  });

  it("Transport maps 1-6 to transport commands", () => {
    const { actor, calls, sw } = start();
    actor.send({ type: "ENTER_SPECIAL", preset: "transport" });
    for (const id of [1, 2, 3, 4, 5, 6].map((n) => ControlId.Stompswitch1 + n - 1)) sw(id);
    expect(calls).toEqual(["Cycle", "Rewind", "Fast forward", "Stop", "Play", "Record"].map((c) => `transport: ${c}`));
  });

  it("A and B switch between Track and Transport without returning", () => {
    const { actor, calls, sw, mode } = start();
    actor.send({ type: "ENTER_SPECIAL", preset: "track" });
    sw(ControlId.StompswitchB);
    expect(mode()).toBe("transport");
    sw(ControlId.StompswitchA);
    expect(mode()).toBe("track");
    expect(calls).toEqual([]);
  });

  it("ignores switch events on the user preset (the engine handles those)", () => {
    const { calls, sw, mode } = start();
    sw(ControlId.Stompswitch1);
    expect(mode()).toBe("user");
    expect(calls).toEqual([]);
  });
});
