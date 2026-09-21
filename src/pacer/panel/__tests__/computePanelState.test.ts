import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ControlId,
  SwitchMessageType,
  presetIndexToPresetSelectTarget,
  userPresetIndex,
} from "../../protocol/constants";
import { createEmptyPacerConfig, getOrCreateControl, getOrCreatePreset } from "../../protocol/types";
import { decodeSysex } from "../../protocol/decode";
import { applyBoardEvent, createBoardState } from "../../simulator";
import { computePanelState, switchHint, type FirmwareModeState } from "..";
import { switchSpec } from "../../hardware";

const config = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
const USER: FirmwareModeState = { mode: "user", pendingBank: 0, presetButtonDown: false };
const A1 = userPresetIndex(0, 1);
const MMC = userPresetIndex(3, 5); // D5 "MMC": stomps 2-6 drive the middle (transport icon) row
const COLOR = userPresetIndex(3, 2); // D2 "COLOR": each stomp's bar a different hue

describe("computePanelState (factory presets)", () => {
  it("covers every physical switch, with lights only on the indicators each one has", () => {
    const panel = computePanelState(createBoardState(config, A1), USER);
    expect(Object.keys(panel.switches)).toHaveLength(17);
    expect(panel.switches.fs1.lights).toEqual({});
    expect(Object.keys(panel.switches.swA.lights).sort()).toEqual(["bottom", "top"]);
  });

  it("A1: back-row legends lit, front-row legends dark, bars dim until pressed", () => {
    let board = createBoardState(config, A1);
    let panel = computePanelState(board, USER);
    expect(panel.switches.swA.lights.top?.brightness).toBe("bright");
    expect(panel.switches.sw1.lights.top).toBeUndefined();
    expect(panel.switches.sw1.lights.bottom?.brightness).toBe("dim");

    board = applyBoardEvent(board, { controlId: ControlId.Stompswitch1, phase: "press" }).board;
    panel = computePanelState(board, USER);
    expect(panel.switches.sw1.pressed).toBe(true);
    expect(panel.switches.sw1.lights.bottom?.brightness).toBe("bright");
  });

  it("Default LED colors follow the message type, matching the hardware", () => {
    const bars = (idx: number) => {
      const panel = computePanelState(createBoardState(config, idx), USER);
      return (["sw1", "swC", "swD"] as const).map((id) => panel.switches[id].lights.bottom);
    };
    const dim = (hue: string) => ({ brightness: "dim", flashing: false, color: { kind: "hue", hue } });
    const dark = { brightness: "off", flashing: false, color: { kind: "unspecified" } };
    // A1: Program Change -> dim orange; C/D (Preset Inc/Dec) -> dark. Both observed.
    expect(bars(A1)).toEqual([dim("orange"), dark, dark]);
    // B1 (HELX1): MIDI CC -> dim blue (observed).
    expect(bars(userPresetIndex(1, 1))[0]).toEqual(dim("blue"));
    // A5 (NOTES): MIDI Note -> green.
    expect(bars(userPresetIndex(0, 5))[0]?.color).toEqual({ kind: "hue", hue: "green" });
  });

  it("A1: the switch that sent the last Program Change stays bright; the others stay dim", () => {
    let board = createBoardState(config, A1);
    for (const phase of ["press", "release"] as const) {
      board = applyBoardEvent(board, { controlId: ControlId.Stompswitch3, phase }).board;
    }
    const panel = computePanelState(board, USER);
    expect(panel.switches.sw3.lights.bottom?.brightness).toBe("bright");
    expect(panel.switches.sw1.lights.bottom?.brightness).toBe("dim");

    for (const phase of ["press", "release"] as const) {
      board = applyBoardEvent(board, { controlId: ControlId.Stompswitch5, phase }).board;
    }
    const after = computePanelState(board, USER);
    expect(after.switches.sw5.lights.bottom?.brightness).toBe("bright");
    expect(after.switches.sw3.lights.bottom?.brightness).toBe("dim");
  });

  it("mode indicators: on a user preset only Preset is lit light blue; in Track only A; in Transport only B", () => {
    const board = createBoardState(config, A1);
    const bars = (firmware: FirmwareModeState) => {
      const panel = computePanelState(board, firmware);
      return (["preset", "swA", "swB"] as const).map((id) => panel.switches[id].lights.bottom?.brightness);
    };
    expect(bars(USER)).toEqual(["bright", "off", "off"]);
    expect(computePanelState(board, USER).switches.preset.lights.bottom?.color).toEqual({ kind: "lightBlue" });
    expect(bars({ ...USER, mode: "track" })).toEqual(["off", "bright", "off"]);
    expect(bars({ ...USER, mode: "transport" })).toEqual(["off", "off", "bright"]);
  });

  it("C/D (Preset Inc/Dec) never light, even while held", () => {
    const board = createBoardState(config, A1);
    const held = applyBoardEvent(board, { controlId: ControlId.StompswitchC, phase: "press" }).board;
    for (const b of [board, held]) {
      const panel = computePanelState(b, USER);
      expect(panel.switches.swC.lights.bottom?.brightness).toBe("off");
      expect(panel.switches.swD.lights.bottom?.brightness).toBe("off");
    }
  });

  it("a LOOPR-style preset (from a real device dump) lights like the hardware", () => {
    const WHITE = { on: 0x17, off: 0x18 };
    const ORANGE = { on: 0x05, off: 0x06 };
    const loopr = createEmptyPacerConfig();
    const preset = getOrCreatePreset(loopr, userPresetIndex(2, 1)); // C1
    const set = (id: number, msgType: number, d0: number, colors: { on: number; off: number }) => {
      const ctl = getOrCreateControl(preset, id);
      ctl.steps[1] = { channel: 0, msgType, data: [d0, 127, 0], active: true };
      ctl.led[1] = { midiController: 0, activeColor: colors.on, inactiveColor: colors.off, position: 0 };
    };
    set(ControlId.StompswitchA, SwitchMessageType.PresetSelect, presetIndexToPresetSelectTarget(A1), WHITE);
    set(ControlId.StompswitchB, SwitchMessageType.CcTrigger, 52, ORANGE);
    set(ControlId.StompswitchC, SwitchMessageType.PresetIncDec, 1, WHITE);
    set(ControlId.StompswitchD, SwitchMessageType.PresetIncDec, 0, WHITE);

    let board = createBoardState(loopr, userPresetIndex(2, 1));
    const bar = (id: "swA" | "swB" | "swC" | "swD") => computePanelState(board, USER).switches[id].lights.bottom;
    expect(bar("swA")).toEqual({ brightness: "bright", flashing: false, color: { kind: "hue", hue: "white" } });
    expect(bar("swB")).toEqual({ brightness: "dim", flashing: false, color: { kind: "hue", hue: "orange" } });
    expect(bar("swC")?.brightness).toBe("off");
    expect(bar("swD")?.brightness).toBe("off");
    // Legends follow each switch's assignment: A (reprogrammed) and B (a CC) are dark; C/D still
    // step presets, so their arrows are lit.
    const legend = (id: "swA" | "swB" | "swC" | "swD") => computePanelState(board, USER).switches[id].lights.top;
    expect(legend("swA")).toBeUndefined();
    expect(legend("swB")).toBeUndefined();
    expect(legend("swC")?.brightness).toBe("bright");
    expect(legend("swD")?.brightness).toBe("bright");
    board = applyBoardEvent(board, { controlId: ControlId.StompswitchC, phase: "press" }).board; // wraps to B6
    expect(computePanelState(board, USER).switches.swC.lights.bottom?.brightness ?? "off").toBe("off");
  });

  it("D2 COLOR: each front-row bar shows its configured hue", () => {
    const panel = computePanelState(createBoardState(config, COLOR), USER);
    expect(panel.switches.sw1.lights.bottom?.color).toEqual({ kind: "hue", hue: "red" });
    expect(panel.switches.sw2.lights.bottom?.color).toEqual({ kind: "hue", hue: "orange" });
    expect(panel.switches.sw6.lights.bottom?.color).toEqual({ kind: "hue", hue: "purple" });
  });

  it("D5 MMC: stomps 2-6 drive their transport icons (middle row) via LED num 2", () => {
    const board = applyBoardEvent(createBoardState(config, MMC), {
      controlId: ControlId.Stompswitch5,
      phase: "press",
    }).board;
    const panel = computePanelState(board, USER);
    expect(panel.switches.sw5.lights.middle).toEqual({ brightness: "bright", flashing: false, color: { kind: "ink" } });
    expect(panel.switches.sw2.lights.middle?.brightness).toBe("dim");
    expect(panel.switches.sw5.lights.bottom).toBeUndefined();
  });

  it("preset select, Track and Transport override lights and the display", () => {
    const board = createBoardState(config, A1);
    const select = computePanelState(board, { mode: "presetSelect", pendingBank: 0, presetButtonDown: true });
    expect(select.switches.preset.pressed).toBe(true);
    expect(select.switches.preset.lights.bottom?.flashing).toBe(true);
    expect(select.switches.sw1.lights.bottom?.brightness).toBe("bright"); // A1 is loaded
    expect(select.display).toEqual({ line1: "BANK", line2: "A-", line2Blinking: true });

    const transport = computePanelState(board, { mode: "transport", pendingBank: 0, presetButtonDown: false });
    expect(transport.switches.sw4.lights.middle?.brightness).toBe("bright");
    expect(transport.switches.sw4.lights.top).toBeUndefined();
    expect(transport.display).toEqual({ line1: "TRANS", line2: "↩A1", line2Blinking: false });
  });

  it("shows the preset name and label on the display", () => {
    expect(computePanelState(createBoardState(config, A1), USER).display).toEqual({
      line1: "PRGM1",
      line2: "A1",
      line2Blinking: false,
    });
  });
});

describe("switchHint", () => {
  it("describes what a press would do in each mode", () => {
    const hint = (id: Parameters<typeof switchSpec>[0], mode: FirmwareModeState["mode"], pendingBank = 0) =>
      switchHint(switchSpec(id), config, A1, mode, pendingBank);
    expect(hint("sw1", "user")).toBe("PC0");
    expect(hint("swA", "user")).toBe("→track");
    expect(hint("sw3", "presetSelect", 1)).toBe("Load B3");
    expect(hint("swC", "presetSelect")).toBe("Bank C");
    expect(hint("sw2", "transport")).toBe("Rewind");
    expect(hint("preset", "track")).toBe("tap: back to A1");
    expect(hint("preset", "user")).toBe("hold: preset select");
  });
});
