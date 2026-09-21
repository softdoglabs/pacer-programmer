import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRESET_HOLD_MS } from "../../pacer/device";
import { loadFactoryDefaults } from "../../pacer/factoryDefaults";
import { ControlId, SwitchMessageType, userPresetIndex } from "../../pacer/protocol/constants";
import { createEmptyPacerConfig, getOrCreateControl, getOrCreatePreset } from "../../pacer/protocol/types";
import { FakeMidiAccess, FakeOutput } from "../../midi/__tests__/fakeMidi";
import { usePacerStore } from "../pacerStore";

const store = () => usePacerStore.getState();
const A1 = userPresetIndex(0, 1);
const A3 = userPresetIndex(0, 3);
const A4 = userPresetIndex(0, 4);
const A5 = userPresetIndex(0, 5);
const B1 = userPresetIndex(1, 1);
const B3 = userPresetIndex(1, 3);
const B5 = userPresetIndex(1, 5);
const COLOR_PRESET = userPresetIndex(3, 2); // D2 "COLOR": switches 1-6 are CC toggles

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

function allLines() {
  return store().log.flatMap((e) => e.lines);
}

beforeEach(() => {
  vi.useFakeTimers();
  store().loadConfig(loadFactoryDefaults(), "Factory defaults", A4);
});
afterEach(() => vi.useRealTimers());

describe("pacerStore: user presets", () => {
  it("starts on the factory defaults", () => {
    usePacerStore.setState(usePacerStore.getInitialState());
    expect(store().configSource).toBe("Factory defaults");
    expect(store().board.activePresetIndex).toBe(A1);
    expect(store().board.config.presets[A1]?.name).toBe("PRGM1");
  });

  it("routes presses and releases to the engine", () => {
    store().jumpToPreset(COLOR_PRESET);
    store().clearLog();
    tap(ControlId.Stompswitch1);
    tap(ControlId.Stompswitch1);
    expect(store().log.map((e) => e.title)).toEqual(["Stomp 1 — press", "Stomp 1 — press"]);
    expect(allLines()).toEqual([expect.stringContaining("CC#91"), expect.stringContaining("CC#91")]);
  });

  it("C/D step through presets, swallowing the preset-changing press's release", () => {
    tap(ControlId.StompswitchD);
    expect(store().board.activePresetIndex).toBe(A5);
    tap(ControlId.StompswitchC);
    tap(ControlId.StompswitchC);
    expect(store().board.activePresetIndex).toBe(A3);
    expect(allLines().some((l) => l.includes("warning"))).toBe(false);
    expect(store().swallowedReleases).toEqual([]);
  });

  it("doesn't log a second warning when releasing an unconfigured control", () => {
    const config = createEmptyPacerConfig();
    getOrCreateControl(getOrCreatePreset(config, A1), ControlId.Stompswitch1).steps[1] = {
      channel: 0,
      msgType: SwitchMessageType.CcTrigger,
      data: [1, 127, 0],
      active: true,
    };
    store().loadConfig(config, "test");
    tap(ControlId.Stompswitch6);
    expect(store().log).toHaveLength(1);
  });

  it("jumpToPreset resets runtime state and logs an app entry", () => {
    store().jumpToPreset(COLOR_PRESET);
    tap(ControlId.Stompswitch2);
    store().jumpToPreset(B1);
    expect(store().board.activePresetIndex).toBe(B1);
    expect(store().board.controls).toEqual({});
    expect(store().log.at(-1)?.kind).toBe("app");
  });
});

describe("pacerStore: preset select", () => {
  it("hold -> bank -> number loads that preset via the firmware machine, with nothing sent to the engine", () => {
    store().clearLog();
    holdPreset();
    expect(store().deviceMode).toEqual({ mode: "presetSelect", pendingBank: 0, presetButtonDown: false });
    tap(ControlId.StompswitchB);
    expect(store().deviceMode.pendingBank).toBe(1);
    expect(store().board.activePresetIndex).toBe(A4);
    tap(ControlId.Stompswitch1);
    expect(store().deviceMode.mode).toBe("user");
    expect(store().board.activePresetIndex).toBe(B1);
    expect(store().log.map((e) => e.kind)).toEqual(["firmware"]);
    expect(store().swallowedReleases).toEqual([]);
  });

  it("a tap on a user preset doesn't enter selection", () => {
    store().clearLog();
    tapPreset();
    expect(store().deviceMode.mode).toBe("user");
    expect(store().log).toEqual([]);
  });

  it("a bare 1-6 loads that number in the current bank", () => {
    store().jumpToPreset(B3);
    holdPreset();
    tap(ControlId.Stompswitch5);
    expect(store().board.activePresetIndex).toBe(B5);
  });

  it("a tap cancels selection and switches work normally again", () => {
    holdPreset();
    tapPreset();
    expect(store().deviceMode.mode).toBe("user");
    store().clearLog();
    tap(ControlId.Stompswitch1);
    expect(store().log[0]?.kind).toBe("control");
  });
});

describe("pacerStore: built-in Track/Transport presets", () => {
  it("A enters Track, where C/D are track down/up and a [Preset] tap returns to the last preset", () => {
    tap(ControlId.Stompswitch1); // leave some state behind on A4
    tap(ControlId.StompswitchA);
    expect(store().deviceMode.mode).toBe("track");
    expect(store().board.activePresetIndex).toBe(A4);

    const logLength = store().log.length;
    tap(ControlId.StompswitchD);
    tap(ControlId.StompswitchC);
    expect(store().board.activePresetIndex).toBe(A4); // C/D no longer change presets
    expect(
      store()
        .log.slice(logLength)
        .flatMap((e) => e.lines),
    ).toEqual([expect.stringContaining("Next track"), expect.stringContaining("Previous track")]);

    tapPreset();
    expect(store().deviceMode.mode).toBe("user");
    expect(store().board.activePresetIndex).toBe(A4);
    expect(store().swallowedReleases).toEqual([]);
  });

  it("B enters Transport", () => {
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
    store().loadConfig(loadFactoryDefaults(), "Factory defaults");
    expect(store().deviceMode.mode).toBe("user");
  });
});

describe("pacerStore: MIDI output", () => {
  // Reset the MIDI slice between tests (the connection itself lives in the store's closure).
  beforeEach(() =>
    usePacerStore.setState({ midi: { status: "disconnected", outputs: [], inputs: [], sysexEnabled: false } }),
  );

  async function connect(ports: FakeOutput[], sysex = true) {
    const access = new FakeMidiAccess(ports, sysex);
    await store().connectMidi(async () => access);
    return access;
  }

  it("lists outputs after connecting, but sends nothing until an output is chosen", async () => {
    const port = new FakeOutput("p1", "Quad Cortex");
    await connect([port]);
    expect(store().midi).toMatchObject({ status: "connected", outputs: [{ id: "p1", name: "Quad Cortex" }] });
    tap(ControlId.Stompswitch1);
    expect(port.sent).toEqual([]);
  });

  it("sends each simulated message's bytes to the chosen output, and logs it", async () => {
    const port = new FakeOutput("p1", "Quad Cortex");
    await connect([port]);
    store().selectMidiOutput("p1");
    tap(ControlId.Stompswitch1); // factory A4, switch 1: Program Change 18, global channel -> MIDI channel 1
    expect(port.sent).toEqual([[0xc0, 18]]);
    expect(store().log.at(-1)?.lines).toContain("→ sent to Quad Cortex");
  });

  it("doesn't send SysEx (MMC) without the SysEx permission, and says so", async () => {
    const port = new FakeOutput("p1", "DAW");
    await connect([port], false);
    store().selectMidiOutput("p1");
    store().jumpToPreset(userPresetIndex(3, 5)); // D5 "MMC"
    tap(ControlId.Stompswitch2);
    expect(port.sent).toEqual([]);
    expect(store().log.at(-1)?.lines.at(-1)).toMatch(/not sent to DAW: SysEx permission not granted/);
  });

  it("stops sending when the chosen output disappears", async () => {
    const port = new FakeOutput("p1", "Quad Cortex");
    const access = await connect([port]);
    store().selectMidiOutput("p1");
    access.changePorts([]);
    expect(store().midi.outputId).toBeUndefined();
    expect(store().midi.outputs).toEqual([]);
    expect(store().log.at(-1)?.lines).toEqual(["Output disconnected; sending stopped"]);
  });

  it("reports unsupported and denied access", async () => {
    await store().connectMidi(undefined);
    // In Node there's no navigator.requestMIDIAccess, so the default requester is unavailable.
    expect(store().midi.status).toBe("unsupported");
    usePacerStore.setState({ midi: { status: "disconnected", outputs: [], inputs: [], sysexEnabled: false } });
    await store().connectMidi(async () => {
      throw new Error("nope");
    });
    expect(store().midi).toMatchObject({ status: "denied", error: "nope" });
  });
});

describe("pacerStore: sessions", () => {
  it("loading a configuration starts a fresh session, whatever state the simulator was in", () => {
    // Build up state: a toggled control, a selection, Track mode, a held [Preset], log entries.
    store().jumpToPreset(COLOR_PRESET);
    tap(ControlId.Stompswitch1);
    store().selectControl(ControlId.Stompswitch1);
    store().press(ControlId.Stompswitch2); // held when the config changes
    tap(ControlId.StompswitchA); // -> Track
    store().presetButtonDown();
    const before = store().sessionId;

    store().loadConfig(loadFactoryDefaults(), "Factory defaults");

    const s = store();
    expect(s.sessionId).toBeGreaterThan(before);
    expect(s.board.activePresetIndex).toBe(A1);
    expect(s.board.controls).toEqual({});
    expect(s.board.lastProgramChangeControlId).toBeUndefined();
    expect(s.deviceMode).toEqual({ mode: "user", pendingBank: 0, presetButtonDown: false });
    expect(s.log).toEqual([]);
    expect(s.swallowedReleases).toEqual([]);
    expect(s.selectedControlId).toBeUndefined();

    // The old session's pending [Preset] hold timer died with it, so it never fires.
    vi.advanceTimersByTime(PRESET_HOLD_MS);
    expect(store().deviceMode.mode).toBe("user");
  });
});
