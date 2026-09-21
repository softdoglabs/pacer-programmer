import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PRESET_HOLD_MS } from "../../pacer/device";
import { ControlId } from "../../pacer/protocol/constants";
import { decodeSysex } from "../../pacer/protocol/decode";
import { buildDemoConfig } from "../../pacer/simulator";
import { usePacerStore } from "../pacerStore";

const store = () => usePacerStore.getState();

function tap(controlId: number) {
  store().press(controlId);
  store().release(controlId);
}

function tapPreset() {
  store().presetButtonDown();
  store().presetButtonUp();
}

function holdPreset() {
  store().presetButtonDown();
  vi.advanceTimersByTime(PRESET_HOLD_MS);
  store().presetButtonUp();
}

beforeEach(() => {
  vi.useFakeTimers();
  store().loadConfig(buildDemoConfig(), "Demo config");
});
afterEach(() => vi.useRealTimers());

describe("pacerStore", () => {
  it("routes presses to the engine while playing", () => {
    tap(ControlId.Stompswitch1);
    expect(store().log.map((e) => e.title)).toEqual(["Stomp 1 — press", "Stomp 1 — release"]);
  });

  it("swallows the release of a preset-changing press instead of logging a guard warning", () => {
    tap(ControlId.StompswitchA); // demo A1: PC + jump to B1
    expect(store().board.activePresetIndex).toBe(6);
    expect(store().log).toHaveLength(1);
    expect(store().log.flatMap((e) => e.lines).some((l) => l.includes("warning"))).toBe(false);
    expect(store().swallowedReleases).toEqual([]);
  });

  it("doesn't log a second warning when releasing an unconfigured control", () => {
    tap(ControlId.Stompswitch6);
    expect(store().log).toHaveLength(1);
  });

  it("Preset hold -> bank -> number loads that preset via the firmware machine, with nothing sent to the engine", () => {
    holdPreset();
    expect(store().deviceMode).toEqual({ mode: "presetSelect", pendingBank: 0, presetButtonDown: false });
    tap(ControlId.StompswitchB);
    expect(store().deviceMode.pendingBank).toBe(1);
    expect(store().board.activePresetIndex).toBe(0);
    tap(ControlId.Stompswitch1);
    expect(store().deviceMode.mode).toBe("user");
    expect(store().board.activePresetIndex).toBe(6);
    expect(store().log.map((e) => e.kind)).toEqual(["firmware"]);
    expect(store().swallowedReleases).toEqual([]);
  });

  it("a Preset tap on a user preset doesn't enter selection", () => {
    tapPreset();
    expect(store().deviceMode.mode).toBe("user");
    expect(store().log).toEqual([]);
  });

  it("a bare 1-6 in preset select loads that number in the current bank", () => {
    store().jumpToPreset(8); // B3
    holdPreset();
    tap(ControlId.Stompswitch5);
    expect(store().board.activePresetIndex).toBe(10); // B5
  });

  it("a Preset tap cancels selection and switches work normally again", () => {
    holdPreset();
    tapPreset();
    expect(store().deviceMode.mode).toBe("user");
    tap(ControlId.Stompswitch1);
    expect(store().log[0]?.kind).toBe("control");
  });

  it("jumpToPreset resets runtime state and logs an app entry", () => {
    tap(ControlId.Stompswitch2);
    store().jumpToPreset(6);
    expect(store().board.activePresetIndex).toBe(6);
    expect(store().board.controls).toEqual({});
    expect(store().log.at(-1)?.kind).toBe("app");
  });
});

describe("pacerStore with the factory presets", () => {
  beforeEach(() => {
    const config = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
    store().loadConfig(config, "factory-presets.syx", 3); // A4
  });

  it("C/D step through presets", () => {
    tap(ControlId.StompswitchD);
    expect(store().board.activePresetIndex).toBe(4);
    tap(ControlId.StompswitchC);
    tap(ControlId.StompswitchC);
    expect(store().board.activePresetIndex).toBe(2);
  });

  it("A enters the built-in Track preset, where C/D are track down/up and [Preset] returns to the last preset", () => {
    tap(ControlId.Stompswitch1); // leave some runtime state behind on A4
    tap(ControlId.StompswitchA);
    expect(store().deviceMode.mode).toBe("track");
    expect(store().board.activePresetIndex).toBe(3);

    const logLength = store().log.length;
    tap(ControlId.StompswitchD);
    tap(ControlId.StompswitchC);
    expect(store().board.activePresetIndex).toBe(3); // C/D no longer change presets
    expect(store().log.slice(logLength).flatMap((e) => e.lines)).toEqual([
      expect.stringContaining("Next track"),
      expect.stringContaining("Previous track"),
    ]);

    tapPreset();
    expect(store().deviceMode.mode).toBe("user");
    expect(store().board.activePresetIndex).toBe(3);
    expect(store().swallowedReleases).toEqual([]);
  });

  it("B enters the built-in Transport preset", () => {
    tap(ControlId.StompswitchB);
    expect(store().deviceMode.mode).toBe("transport");
    tap(ControlId.Stompswitch5);
    expect(store().log.at(-1)?.lines[0]).toContain("Play");
  });

  it("external controls do nothing inside a built-in preset", () => {
    tap(ControlId.StompswitchA);
    const logLength = store().log.length;
    tap(ControlId.Footswitch1);
    expect(store().log.length).toBe(logLength);
    expect(store().swallowedReleases).toEqual([]);
  });

  it("loading a config leaves any built-in preset", () => {
    tap(ControlId.StompswitchA);
    store().loadConfig(buildDemoConfig(), "Demo config");
    expect(store().deviceMode.mode).toBe("user");
  });
});
