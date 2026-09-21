import { describe, expect, it } from "vitest";
import { SPECIAL_PRESETS } from "../../device";
import { switchSpec } from "../../hardware";
import { ControlMode, SwitchMessageType, userPresetIndex } from "../../protocol/constants";
import { LED_COLOR_DEFAULT } from "../../protocol/ledColors";
import type { LedConfig, SwitchControl } from "../../protocol/types";
import { createControlRuntimeState, type ControlRuntimeState } from "../../simulator/types";
import { dawPresetLights, presetButtonBar, presetSelectLights } from "../firmwareLights";
import { idleLights } from "../lights";
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

describe("userPresetLights", () => {
  it("LED num 0 (Default) drives the bar with the inactive color at rest and the active color while held", () => {
    const c = control({ 1: { activeColor: RED_BRIGHT, inactiveColor: RED_DIM, position: 0 } });
    expect(userPresetLights(sw1, c, undefined)).toEqual({
      bottom: { brightness: "dim", flashing: false, color: { kind: "hue", hue: "red" } },
    });
    expect(userPresetLights(sw1, c, runtime({ pressed: true })).bottom).toEqual({
      brightness: "bright",
      flashing: false,
      color: { kind: "hue", hue: "red" },
    });
  });

  it("LED num 2 lights the middle icon row in its printed ink, not the config hue", () => {
    const c = control({ 1: { activeColor: BLUE_BRIGHT, inactiveColor: 0, position: 2 } });
    expect(userPresetLights(sw1, c, runtime({ pressed: true }))).toEqual({
      middle: { brightness: "bright", flashing: false, color: { kind: "ink" } },
    });
    expect(userPresetLights(sw1, c, undefined).middle?.brightness).toBe("off");
  });

  it("Default (0x7F) uses the message type's documented hue: dim at rest, bright when active", () => {
    const c = control({ 1: { activeColor: LED_COLOR_DEFAULT, inactiveColor: LED_COLOR_DEFAULT, position: 0 } });
    // control() builds CC Trigger steps: MIDI CC's default is 9 (blue).
    expect(userPresetLights(sw1, c, undefined).bottom).toEqual({
      brightness: "dim",
      flashing: false,
      color: { kind: "hue", hue: "blue" },
    });
    expect(userPresetLights(sw1, c, runtime({ pressed: true })).bottom).toEqual({
      brightness: "bright",
      flashing: false,
      color: { kind: "hue", hue: "blue" },
    });
  });

  it("a Program Change step stays lit while its switch sent the preset's last Program Change", () => {
    const c = control({ 1: { activeColor: LED_COLOR_DEFAULT, inactiveColor: LED_COLOR_DEFAULT, position: 0 } });
    c.steps[1] = { channel: 0, msgType: SwitchMessageType.ProgramAndBank, data: [3, 0, 0], active: true };
    expect(userPresetLights(sw1, c, undefined, false).bottom).toEqual({
      brightness: "dim",
      flashing: false,
      color: { kind: "hue", hue: "orange" },
    });
    expect(userPresetLights(sw1, c, undefined, true).bottom?.brightness).toBe("bright");
  });

  it("a toggled-on step keeps its light active after release", () => {
    const c = control({ 1: { activeColor: RED_BRIGHT, inactiveColor: RED_DIM, position: 0 } });
    expect(userPresetLights(sw1, c, runtime({ toggleState: { 1: true } })).bottom?.brightness).toBe("bright");
  });

  it("all-steps-at-once: every active step drives its own indicator; the lower step wins a conflict", () => {
    const c = control(
      {
        1: { activeColor: RED_BRIGHT, inactiveColor: RED_DIM, position: 0 },
        2: { activeColor: BLUE_BRIGHT, inactiveColor: 0, position: 2 },
        3: { activeColor: BLUE_BRIGHT, inactiveColor: BLUE_BRIGHT, position: 1 },
      },
      { activeSteps: [1, 2, 3] },
    );
    const lights = userPresetLights(sw1, c, undefined);
    expect(lights.bottom?.color).toEqual({ kind: "hue", hue: "red" }); // step 1, not step 3
    expect(lights.middle?.brightness).toBe("off");
  });

  it("sequence mode shows only the most recently fired step's LED", () => {
    const c = control(
      {
        1: { activeColor: RED_BRIGHT, inactiveColor: RED_DIM, position: 0 },
        2: { activeColor: BLUE_BRIGHT, inactiveColor: BLUE_BRIGHT + 1, position: 0 },
      },
      { mode: ControlMode.Sequence, activeSteps: [1, 2] },
    );
    expect(userPresetLights(sw1, c, undefined).bottom?.color).toEqual({ kind: "hue", hue: "red" });
    // After step 1 fired, the pointer is on 2; the LED still shows step 1 until step 2 fires.
    expect(userPresetLights(sw1, c, runtime({ sequencePointer: 2 })).bottom?.color).toEqual({
      kind: "hue",
      hue: "red",
    });
    expect(userPresetLights(sw1, c, runtime({ sequencePointer: 3 })).bottom?.color).toEqual({
      kind: "hue",
      hue: "blue",
    });
  });

  it("ignores LED nums a switch can't show (A-D have no middle row; their legend isn't addressable)", () => {
    const c = control({ 1: { activeColor: RED_BRIGHT, inactiveColor: RED_DIM, position: 2 } });
    expect(userPresetLights(switchSpec("swA"), c, undefined)).toEqual({});
  });
});

describe("idleLights", () => {
  it("back-row legends are always lit in their ink; front-row legends are dark", () => {
    expect(idleLights(switchSpec("swA"))).toEqual({
      top: { brightness: "bright", flashing: false, color: { kind: "ink" } },
    });
    expect(idleLights(switchSpec("preset")).top?.brightness).toBe("bright");
    expect(idleLights(sw1)).toEqual({});
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
  it("Track lights the top text row; Transport lights the middle icon row", () => {
    expect(dawPresetLights(sw1, SPECIAL_PRESETS.track)).toEqual({
      top: { brightness: "bright", flashing: false, color: { kind: "ink" } },
    });
    expect(dawPresetLights(sw1, SPECIAL_PRESETS.transport)).toEqual({
      middle: { brightness: "bright", flashing: false, color: { kind: "ink" } },
    });
  });

  it("back-row switches have no middle row, and their always-lit legends come from idleLights", () => {
    expect(dawPresetLights(switchSpec("swC"), SPECIAL_PRESETS.transport)).toEqual({});
  });
});

describe("presetButtonBar", () => {
  it("flashes bright red in preset select, is solid royal blue in DAW presets, and is off otherwise", () => {
    expect(presetButtonBar("presetSelect")).toEqual({
      brightness: "bright",
      flashing: true,
      color: { kind: "hue", hue: "red" },
    });
    expect(presetButtonBar("track")).toEqual({ brightness: "bright", flashing: false, color: { kind: "royalBlue" } });
    expect(presetButtonBar("user").brightness).toBe("off");
  });
});
