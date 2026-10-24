// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { ControlId } from "../protocol/constants";
import type { DawCommand, Evidence, IconId, IndicatorSpec, InkColor, LegendFunction, SwitchSpec } from "./types";

/*
 * The Pacer's physical controls. The evidence behind each indicator is recorded in its
 * `evidence`; the named entries below keep the table readable.
 */
const OWNER_LAYOUT: Evidence = {
  kind: "confirmed",
  source: "project owner: front row top = text, middle = icons, bottom = bar",
};
const OWNER_PRESET_LED: Evidence = {
  kind: "confirmed",
  source: "project owner: [Preset]'s bar is light blue on a user preset and flashes red in preset select",
};
const SOS_BAR: Evidence = {
  kind: "confirmed",
  source: "Sound on Sound review ('12-color RGB LED bar', dim/bright levels); factory COLOR preset",
};
const MMC_MIDDLE: Evidence = {
  kind: "confirmed",
  source: "factory MMC preset (D5) drives stomps 2-6 with LED num 2 (middle) to light the transport icons",
};
const RGB_LEGENDS: Evidence = {
  kind: "confirmed",
  source:
    "project owner: all three rows are RGB and take a step's colors (LPOS/LROWS test presets, 2026-09-22). " +
    "The printed ink is what shows when the firmware lights a legend for an assigned function",
};
const PHOTO_INK: Evidence = { kind: "inferred", reason: "ink colors read off a product photo" };
const OWNER_TEXT_INK: Evidence = {
  kind: "confirmed",
  source: "project owner: front-row text legends are lemon yellow, except Click, which is white",
};
const OWNER_B_LEGEND_INK: Evidence = {
  kind: "confirmed",
  source: "project owner: B's stop/play/record legend is bright green",
};
const LED_NUM_MAP: Evidence = {
  kind: "confirmed",
  source:
    "project owner, LPOS test preset (2026-09-22): on switches 1-6, LED num 0 and 1 light the bar, " +
    "2 the icon legend, 3 the text legend; on A-D, 0 and 1 light the bar, 2 the printed legend, 3 nothing",
};
const LEGEND_BY_FUNCTION: Evidence = {
  kind: "confirmed",
  source:
    "User Guide: 'When DAW Transport or Track functions are assigned, the top and middle row icons are illuminated'; " +
    "project owner: A's 'Track' legend is dark on presets where A no longer selects Track (A1, C1 of their dump), lit elsewhere",
};
const DEFAULT_IS_BAR: Evidence = {
  kind: "inferred",
  reason: "every factory LED entry with a real RGB color uses LED num 0 (Default); the only non-bar use sets 2",
};

function bar(...extra: Evidence[]): IndicatorSpec {
  return {
    id: "bottom",
    color: { kind: "variable" },
    face: { kind: "bar" },
    addressable: true,
    evidence: [SOS_BAR, DEFAULT_IS_BAR, ...extra],
  };
}

/**
 * Front-row stompswitches: top = text legend (a Track function), middle = icon legend (a
 * Transport function), bottom = RGB bar. Layout confirmed by the owner.
 */
function frontRowIndicators(
  text: string,
  textInk: InkColor,
  trackCommand: DawCommand,
  icon: IconId,
  transportCommand: DawCommand,
): IndicatorSpec[] {
  return [
    {
      id: "top",
      color: { kind: "variable", ink: textInk },
      face: { kind: "text", text },
      addressable: true,
      depicts: { kind: "dawCommand", command: trackCommand },
      evidence: [OWNER_LAYOUT, RGB_LEGENDS, OWNER_TEXT_INK, LED_NUM_MAP, LEGEND_BY_FUNCTION],
    },
    {
      id: "middle",
      color: { kind: "variable", ink: "white" },
      face: { kind: "icons", icons: [icon] },
      addressable: true,
      depicts: { kind: "dawCommand", command: transportCommand },
      evidence: [OWNER_LAYOUT, MMC_MIDDLE, RGB_LEGENDS, PHOTO_INK, LED_NUM_MAP, LEGEND_BY_FUNCTION],
    },
    bar(),
  ];
}

/**
 * Back-row switches (Preset, A-D): a printed legend over an RGB bar. The legend lights while its
 * function is assigned, and a step can address it with LED num 2 ("middle"): these switches have
 * no third light, so LED num 3 does nothing (owner-confirmed, LPOS test preset).
 */
function backRowIndicators(
  face: IndicatorSpec["face"],
  depicts: LegendFunction,
  ink: InkColor,
  inkEvidence: Evidence = PHOTO_INK,
  ...barEvidence: Evidence[]
): IndicatorSpec[] {
  return [
    {
      id: "middle",
      color: { kind: "variable", ink },
      face,
      addressable: true,
      depicts,
      evidence: [OWNER_LAYOUT, RGB_LEGENDS, inkEvidence, LED_NUM_MAP, LEGEND_BY_FUNCTION],
    },
    bar(...barEvidence),
  ];
}

export const PACER_HARDWARE = [
  {
    id: "preset",
    kind: "presetSwitch",
    name: "Preset",
    indicators: backRowIndicators(
      { kind: "text", text: "Preset" },
      { kind: "presetButton" },
      "blue",
      PHOTO_INK,
      OWNER_PRESET_LED,
    ),
    placement: { kind: "panel", row: "back", col: 0 },
  },
  {
    id: "swA",
    kind: "stompswitch",
    name: "A",
    controlId: ControlId.StompswitchA,
    selectRole: { kind: "bank", bank: 0 },
    marking: "badge",
    indicators: backRowIndicators({ kind: "text", text: "Track" }, { kind: "selectMode", mode: "track" }, "red"),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "back", col: 1 },
  },
  {
    id: "swB",
    kind: "stompswitch",
    name: "B",
    controlId: ControlId.StompswitchB,
    selectRole: { kind: "bank", bank: 1 },
    marking: "badge",
    indicators: backRowIndicators(
      { kind: "icons", icons: ["stop", "play", "record"] },
      { kind: "selectMode", mode: "transport" },
      "green",
      OWNER_B_LEGEND_INK,
    ),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "back", col: 2 },
  },
  {
    id: "swC",
    kind: "stompswitch",
    name: "C",
    controlId: ControlId.StompswitchC,
    selectRole: { kind: "bank", bank: 2 },
    marking: "badge",
    indicators: backRowIndicators(
      { kind: "icons", icons: ["arrowDown"] },
      { kind: "navigate", direction: "previous" },
      "white",
    ),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "back", col: 3 },
  },
  {
    id: "swD",
    kind: "stompswitch",
    name: "D",
    controlId: ControlId.StompswitchD,
    selectRole: { kind: "bank", bank: 3 },
    marking: "badge",
    indicators: backRowIndicators(
      { kind: "icons", icons: ["arrowUp"] },
      { kind: "navigate", direction: "next" },
      "white",
    ),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "back", col: 4 },
  },
  {
    id: "sw1",
    kind: "stompswitch",
    name: "1",
    controlId: ControlId.Stompswitch1,
    selectRole: { kind: "number", num: 1 },
    marking: "numeral",
    indicators: frontRowIndicators("Solo", "yellow", "Solo", "loop", "Cycle"),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "front", col: 0 },
  },
  {
    id: "sw2",
    kind: "stompswitch",
    name: "2",
    controlId: ControlId.Stompswitch2,
    selectRole: { kind: "number", num: 2 },
    marking: "numeral",
    indicators: frontRowIndicators("Mute", "yellow", "Mute", "rewind", "Rewind"),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "front", col: 1 },
  },
  {
    id: "sw3",
    kind: "stompswitch",
    name: "3",
    controlId: ControlId.Stompswitch3,
    selectRole: { kind: "number", num: 3 },
    marking: "numeral",
    indicators: frontRowIndicators("Rec Arm", "yellow", "Rec Arm", "fastForward", "Fast forward"),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "front", col: 2 },
  },
  {
    id: "sw4",
    kind: "stompswitch",
    name: "4",
    controlId: ControlId.Stompswitch4,
    selectRole: { kind: "number", num: 4 },
    marking: "numeral",
    indicators: frontRowIndicators("Click", "white", "Click", "stop", "Stop"),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "front", col: 3 },
  },
  {
    id: "sw5",
    kind: "stompswitch",
    name: "5",
    controlId: ControlId.Stompswitch5,
    selectRole: { kind: "number", num: 5 },
    marking: "numeral",
    indicators: frontRowIndicators("Patch ▼", "yellow", "Previous patch", "play", "Play"),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "front", col: 4 },
  },
  {
    id: "sw6",
    kind: "stompswitch",
    name: "6",
    controlId: ControlId.Stompswitch6,
    selectRole: { kind: "number", num: 6 },
    marking: "numeral",
    indicators: frontRowIndicators("Patch ▲", "yellow", "Next patch", "record", "Record"),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "front", col: 5 },
  },
  ...(
    [
      ["fs1", "FS1", ControlId.Footswitch1],
      ["fs2", "FS2", ControlId.Footswitch2],
      ["fs3", "FS3", ControlId.Footswitch3],
      ["fs4", "FS4", ControlId.Footswitch4],
    ] as const
  ).map(([id, name, controlId], order): SwitchSpec => ({
    id,
    kind: "externalFootswitch",
    name,
    controlId,
    indicators: [],
    placement: { kind: "rear", order },
  })),
  ...(
    [
      ["exp1", "EXP1", ControlId.ExpressionPedal1],
      ["exp2", "EXP2", ControlId.ExpressionPedal2],
    ] as const
  ).map(([id, name, controlId], i): SwitchSpec => ({
    id,
    kind: "expressionPedal",
    name,
    controlId,
    indicators: [],
    placement: { kind: "rear", order: 4 + i },
  })),
] as const satisfies readonly SwitchSpec[];
