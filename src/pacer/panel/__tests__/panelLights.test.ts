// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { describe, expect, it } from "vitest";
import { switchSpec } from "../../hardware";
import {
  ControlMode,
  SwitchMessageType,
  presetIndexToPresetSelectTarget,
  userPresetIndex,
} from "../../protocol/constants";
import { LED_COLOR_DEFAULT } from "../../protocol/ledColors";
import type { LedConfig, SwitchControl } from "../../protocol/types";
import { EMPTY_MIDI_STATE, recordMidi } from "../../simulator/midiState";
import { createControlRuntimeState, type ControlRuntimeState, type OutgoingMidiMessage } from "../../simulator/types";
import { dawPresetLights, presetButtonBar, presetSelectLights } from "../firmwareLights";
import { legendLights } from "../legendLights";
import { userPresetLights } from "../userPresetLights";

const RED_BRIGHT = 0x03;
const RED_DIM = 0x04;
const BLUE_BRIGHT = 0x11;

function control(leds: Record<number, LedConfig>, opts: { mode?: number; activeSteps?: number[] } = {}): SwitchControl {
  const steps: SwitchControl["steps"] = {};
  for (const n of opts.activeSteps ?? [1]) {
    steps[n] = { channel: 0, msgType: SwitchMessageType.CcTrigger, data: [n, 127, 0], active: true };
  }
  return { controlMode: opts.mode as SwitchControl["controlMode"], steps, led: leds };
}

function runtime(patch: Partial<ControlRuntimeState>): ControlRuntimeState {
  return { ...createControlRuntimeState(), ...patch };
}

const sw1 = switchSpec("sw1");
const CTX = { activePresetIndex: userPresetIndex(0, 1), midi: EMPTY_MIDI_STATE, globalChannel: 1 };
/** Remembered MIDI after sending `messages` (steps built by control() are on channel 0 = Global = wire 0). */
/** The MIDI memory after pressing a switch built by control() (CC Trigger on CC 1, press value 127). */
const pressed = () => remembered({ kind: "controlChange", channel: 0, controller: 1, value: 127 });
const remembered = (...messages: OutgoingMidiMessage[]) => ({ ...CTX, midi: recordMidi(EMPTY_MIDI_STATE, messages) });

describe("userPresetLights", () => {
  it("LED num 0 (Default) drives the bar with the inactive color at rest and the active color while held", () => {
    const c = control({ 1: { activeColor: RED_BRIGHT, inactiveColor: RED_DIM, position: 0 } });
    expect(userPresetLights(sw1, c, undefined, CTX)).toEqual({
      bottom: { brightness: "dim", flashing: false, color: { kind: "hue", hue: "red" } },
    });
    expect(userPresetLights(sw1, c, runtime({ pressed: true }), pressed()).bottom).toEqual({
      brightness: "bright",
      flashing: false,
      color: { kind: "hue", hue: "red" },
    });
  });

  it("LED num 2 lights the middle icon row in the step's own color (the legends are RGB)", () => {
    const c = control({ 1: { activeColor: BLUE_BRIGHT, inactiveColor: 0, position: 2 } });
    expect(userPresetLights(sw1, c, runtime({ pressed: true }), pressed())).toEqual({
      middle: { brightness: "bright", flashing: false, color: { kind: "hue", hue: "blue" } },
    });
    expect(userPresetLights(sw1, c, undefined, CTX).middle?.brightness).toBe("off");
  });

  it("Default (0x7F) uses the message type's documented hue: dim at rest, bright when active", () => {
    const c = control({ 1: { activeColor: LED_COLOR_DEFAULT, inactiveColor: LED_COLOR_DEFAULT, position: 0 } });
    // control() builds CC Trigger steps: MIDI CC's default is 9 (blue).
    expect(userPresetLights(sw1, c, undefined, CTX).bottom).toEqual({
      brightness: "dim",
      flashing: false,
      color: { kind: "hue", hue: "blue" },
    });
    expect(userPresetLights(sw1, c, runtime({ pressed: true }), pressed()).bottom).toEqual({
      brightness: "bright",
      flashing: false,
      color: { kind: "hue", hue: "blue" },
    });
  });

  it("a Program Change step is lit while its program is the channel's current one", () => {
    const c = control({ 1: { activeColor: LED_COLOR_DEFAULT, inactiveColor: LED_COLOR_DEFAULT, position: 0 } });
    c.steps[1] = { channel: 0, msgType: SwitchMessageType.ProgramAndBank, data: [3, 0, 0], active: true };
    expect(userPresetLights(sw1, c, undefined, CTX).bottom).toEqual({
      brightness: "dim",
      flashing: false,
      color: { kind: "hue", hue: "orange" },
    });
    expect(
      userPresetLights(sw1, c, undefined, remembered({ kind: "programChange", channel: 0, program: 3 })).bottom
        ?.brightness,
    ).toBe("bright");
  });

  it("a toggled-on CC Toggle step keeps its light on after release", () => {
    const c = control({ 1: { activeColor: RED_BRIGHT, inactiveColor: RED_DIM, position: 0 } });
    c.steps[1] = { channel: 0, msgType: SwitchMessageType.CcToggle, data: [1, 127, 0], active: true };
    const on = remembered({ kind: "controlChange", channel: 0, controller: 1, value: 127 });
    expect(userPresetLights(sw1, c, undefined, on).bottom?.brightness).toBe("bright");
    expect(userPresetLights(sw1, c, undefined, CTX).bottom?.brightness).toBe("dim");
  });

  it("all-steps-at-once: only step 1's light shows, whichever row it targets", () => {
    const c = control(
      {
        1: { activeColor: RED_BRIGHT, inactiveColor: RED_DIM, position: 0 },
        2: { activeColor: BLUE_BRIGHT, inactiveColor: 0, position: 2 },
        3: { activeColor: BLUE_BRIGHT, inactiveColor: BLUE_BRIGHT, position: 1 },
      },
      { activeSteps: [1, 2, 3] },
    );
    const lights = userPresetLights(sw1, c, undefined, CTX);
    expect(lights.bottom?.color).toEqual({ kind: "hue", hue: "red" }); // step 1, on the bar
    expect(lights.middle).toBeUndefined(); // step 2's row stays dark even though it fires too
    expect(Object.keys(lights)).toEqual(["bottom"]);
  });

  it("sequence mode shows the step that fires next", () => {
    const c = control(
      {
        1: { activeColor: RED_BRIGHT, inactiveColor: RED_DIM, position: 0 },
        2: { activeColor: BLUE_BRIGHT, inactiveColor: BLUE_BRIGHT + 1, position: 0 },
      },
      { mode: ControlMode.Sequence, activeSteps: [1, 2] },
    );
    expect(userPresetLights(sw1, c, undefined, CTX).bottom?.color).toEqual({ kind: "hue", hue: "red" });
    // After step 1 fired the pointer is on step 2, and the light shows step 2's color.
    expect(userPresetLights(sw1, c, runtime({ sequencePointer: 2 }), CTX).bottom?.color).toEqual({
      kind: "hue",
      hue: "blue",
    });
    // A pointer past the last active step wraps back to step 1's.
    expect(userPresetLights(sw1, c, runtime({ sequencePointer: 3 }), CTX).bottom?.color).toEqual({
      kind: "hue",
      hue: "red",
    });
  });

  it("lights the back row's printed legend on LED num 2, and nothing on 3", () => {
    const legend = control({ 1: { activeColor: RED_BRIGHT, inactiveColor: RED_DIM, position: 2 } });
    expect(userPresetLights(switchSpec("swA"), legend, undefined, CTX).middle?.color).toEqual({
      kind: "hue",
      hue: "red",
    });
    const noSuchLight = control({ 1: { activeColor: RED_BRIGHT, inactiveColor: RED_DIM, position: 3 } });
    expect(userPresetLights(switchSpec("swA"), noSuchLight, undefined, CTX)).toEqual({});
  });
});

describe("legendLights (a legend lights while its switch is assigned what it depicts)", () => {
  const ink = { brightness: "bright", flashing: false, color: { kind: "ink" } };
  const presetSelect = (target: number): SwitchControl => ({
    steps: { 1: { channel: 0, msgType: SwitchMessageType.PresetSelect, data: [target, 0, 0], active: true } },
    led: {},
  });
  const incDec = (direction: number): SwitchControl => ({
    steps: { 1: { channel: 0, msgType: SwitchMessageType.PresetIncDec, data: [direction, 0, 0], active: true } },
    led: {},
  });

  it("A's 'Track' lights only while A selects Track (observed: dark where A was reprogrammed)", () => {
    expect(legendLights(switchSpec("swA"), "user", presetSelect(1))).toEqual({ middle: ink });
    expect(
      legendLights(switchSpec("swA"), "user", presetSelect(presetIndexToPresetSelectTarget(userPresetIndex(2, 1)))),
    ).toEqual({});
    expect(legendLights(switchSpec("swA"), "user", undefined)).toEqual({});
    expect(legendLights(switchSpec("swB"), "user", presetSelect(2))).toEqual({ middle: ink });
    expect(legendLights(switchSpec("swB"), "user", presetSelect(1))).toEqual({});
  });

  it("C/D's arrows light while they step to the previous/next preset", () => {
    expect(legendLights(switchSpec("swC"), "user", incDec(1))).toEqual({ middle: ink });
    expect(legendLights(switchSpec("swD"), "user", incDec(0))).toEqual({ middle: ink });
    expect(legendLights(switchSpec("swC"), "user", incDec(0))).toEqual({}); // C set to "next": not its arrow
  });

  it("[Preset]'s legend is always lit; front-row legends are dark on user presets", () => {
    expect(legendLights(switchSpec("preset"), "user", undefined)).toEqual({ middle: ink });
    expect(legendLights(sw1, "user", control({ 1: { activeColor: 3, inactiveColor: 4 } }))).toEqual({});
  });

  it("in the DAW presets, Track lights the top text row and Transport the middle icon row", () => {
    expect(legendLights(sw1, "track", undefined)).toEqual({ top: ink }); // Solo
    expect(legendLights(sw1, "transport", undefined)).toEqual({ middle: ink }); // Cycle
    expect(legendLights(switchSpec("swA"), "track", undefined)).toEqual({ middle: ink });
    expect(legendLights(switchSpec("swB"), "track", undefined)).toEqual({ middle: ink });
    expect(legendLights(switchSpec("swC"), "transport", undefined)).toEqual({ middle: ink }); // previous track
  });
});

describe("presetSelectLights", () => {
  const B3 = userPresetIndex(1, 3);
  const bar = (id: Parameters<typeof switchSpec>[0], pendingBank: number) =>
    presetSelectLights(switchSpec(id), pendingBank, B3).bottom;

  it("on the loaded preset's bank: that number is solid bright royal blue, the other five flash dim", () => {
    expect(bar("sw3", 1)).toEqual({ brightness: "bright", flashing: false, color: { kind: "royalBlue" } });
    for (const id of ["sw1", "sw2", "sw4", "sw5", "sw6"] as const) {
      expect(bar(id, 1)).toEqual({ brightness: "dim", flashing: true, color: { kind: "royalBlue" } });
    }
  });

  it("on another bank all six flash dim", () => {
    expect(bar("sw3", 3)?.flashing).toBe(true);
  });

  it("A-D: only the current bank's bar is lit, solid bright royal blue; the other three are off", () => {
    const banks = ["swA", "swB", "swC", "swD"] as const;
    for (let pending = 0; pending < 4; pending++) {
      banks.forEach((id, bank) =>
        expect(bar(id, pending), `${id} with bank ${pending} pending`).toEqual(
          bank === pending
            ? { brightness: "bright", flashing: false, color: { kind: "royalBlue" } }
            : { brightness: "off", flashing: false, color: { kind: "unspecified" } },
        ),
      );
    }
  });
});

describe("dawPresetLights", () => {
  it("lights the current mode's switch (A = Track, B = Transport) light blue, and not the other", () => {
    expect(dawPresetLights(switchSpec("swA"), "track").bottom).toEqual({
      brightness: "bright",
      flashing: false,
      color: { kind: "lightBlue" },
    });
    expect(dawPresetLights(switchSpec("swB"), "track").bottom?.brightness).toBe("off");
    expect(dawPresetLights(switchSpec("swB"), "transport").bottom?.color).toEqual({ kind: "lightBlue" });
    expect(dawPresetLights(switchSpec("swA"), "transport").bottom?.brightness).toBe("off");
  });

  it("leaves DAW-function bars (unknown behavior) and all legends alone", () => {
    expect(dawPresetLights(sw1, "track")).toEqual({});
    expect(dawPresetLights(switchSpec("swC"), "transport")).toEqual({});
  });
});

describe("presetButtonBar", () => {
  it("is the user-preset mode indicator: light blue on a user preset, flashing red in preset select, off in DAW presets", () => {
    expect(presetButtonBar("user")).toEqual({ brightness: "bright", flashing: false, color: { kind: "lightBlue" } });
    expect(presetButtonBar("presetSelect")).toEqual({
      brightness: "bright",
      flashing: true,
      color: { kind: "hue", hue: "red" },
    });
    expect(presetButtonBar("track").brightness).toBe("off");
    expect(presetButtonBar("transport").brightness).toBe("off");
  });
});
