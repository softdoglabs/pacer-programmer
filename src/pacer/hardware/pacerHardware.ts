import { ControlId } from "../protocol/constants";
import type { Evidence, IconId, IndicatorSpec, InkColor, SwitchSpec } from "./types";

/*
 * The Pacer's physical controls. The evidence behind each indicator is recorded in its
 * `evidence`; the named entries below keep the table readable.
 */
const OWNER_LAYOUT: Evidence = {
  kind: "confirmed",
  source: "project owner: front row top = text, middle = icons, bottom = bar; back-row legends always lit",
};
const OWNER_PRESET_LED: Evidence = {
  kind: "confirmed",
  source: "project owner: [Preset]'s LED shows red (flashing) and royal blue",
};
const SOS_BAR: Evidence = {
  kind: "confirmed",
  source: "Sound on Sound review ('12-colour RGB LED bar', dim/bright levels); factory COLOR preset",
};
const MMC_MIDDLE: Evidence = {
  kind: "confirmed",
  source: "factory MMC preset (D5) drives stomps 2-6 with LED num 2 (middle) to light the transport icons",
};
const FIXED_INK: Evidence = {
  kind: "inferred",
  reason: "Sound on Sound: 'illuminated fixed legends'; only the bar is described as RGB",
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
const TOP_ADDRESSABLE: Evidence = {
  kind: "inferred",
  reason: "LED num 3 (Top) exists in the protocol and reference editor; no factory preset uses it",
};
const BACK_LEGEND_UNADDRESSABLE: Evidence = {
  kind: "inferred",
  reason: "unknown whether a step's LED num can address back-row legends, so assumed not",
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
    idle: "dark",
    evidence: [SOS_BAR, DEFAULT_IS_BAR, ...extra],
  };
}

/** Front-row stompswitches: top = text legend, middle = icon legend, bottom = RGB bar (layout confirmed by owner). */
function frontRowIndicators(text: string, textInk: InkColor, icon: IconId): IndicatorSpec[] {
  return [
    {
      id: "top",
      color: { kind: "fixed", ink: textInk },
      face: { kind: "text", text },
      addressable: true,
      idle: "dark",
      evidence: [OWNER_LAYOUT, FIXED_INK, OWNER_TEXT_INK, TOP_ADDRESSABLE],
    },
    {
      id: "middle",
      color: { kind: "fixed", ink: "white" },
      face: { kind: "icons", icons: [icon] },
      addressable: true,
      idle: "dark",
      evidence: [OWNER_LAYOUT, MMC_MIDDLE, FIXED_INK, PHOTO_INK],
    },
    bar(),
  ];
}

/** Back-row switches (Preset, A-D): a printed legend that's always lit by default, over an RGB bar. */
function backRowIndicators(
  face: IndicatorSpec["face"],
  ink: InkColor,
  inkEvidence: Evidence = PHOTO_INK,
  ...barEvidence: Evidence[]
): IndicatorSpec[] {
  return [
    {
      id: "top",
      color: { kind: "fixed", ink },
      face,
      addressable: false,
      idle: "lit",
      evidence: [OWNER_LAYOUT, FIXED_INK, inkEvidence, BACK_LEGEND_UNADDRESSABLE],
    },
    bar(...barEvidence),
  ];
}

export const PACER_HARDWARE = [
  {
    id: "preset",
    kind: "presetSwitch",
    name: "Preset",
    indicators: backRowIndicators({ kind: "text", text: "Preset" }, "blue", PHOTO_INK, OWNER_PRESET_LED),
    placement: { kind: "panel", row: "back", col: 0 },
  },
  {
    id: "swA",
    kind: "stompswitch",
    name: "A",
    controlId: ControlId.StompswitchA,
    selectRole: { kind: "bank", bank: 0 },
    indicators: backRowIndicators({ kind: "text", text: "Track" }, "red"),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "back", col: 1 },
  },
  {
    id: "swB",
    kind: "stompswitch",
    name: "B",
    controlId: ControlId.StompswitchB,
    selectRole: { kind: "bank", bank: 1 },
    indicators: backRowIndicators({ kind: "icons", icons: ["stop", "play", "record"] }, "green", OWNER_B_LEGEND_INK),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "back", col: 2 },
  },
  {
    id: "swC",
    kind: "stompswitch",
    name: "C",
    controlId: ControlId.StompswitchC,
    selectRole: { kind: "bank", bank: 2 },
    indicators: backRowIndicators({ kind: "icons", icons: ["arrowDown"] }, "white"),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "back", col: 3 },
  },
  {
    id: "swD",
    kind: "stompswitch",
    name: "D",
    controlId: ControlId.StompswitchD,
    selectRole: { kind: "bank", bank: 3 },
    indicators: backRowIndicators({ kind: "icons", icons: ["arrowUp"] }, "white"),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "back", col: 4 },
  },
  {
    id: "sw1",
    kind: "stompswitch",
    name: "1",
    controlId: ControlId.Stompswitch1,
    selectRole: { kind: "number", num: 1 },
    indicators: frontRowIndicators("Solo", "yellow", "loop"),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "front", col: 0 },
  },
  {
    id: "sw2",
    kind: "stompswitch",
    name: "2",
    controlId: ControlId.Stompswitch2,
    selectRole: { kind: "number", num: 2 },
    indicators: frontRowIndicators("Mute", "yellow", "rewind"),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "front", col: 1 },
  },
  {
    id: "sw3",
    kind: "stompswitch",
    name: "3",
    controlId: ControlId.Stompswitch3,
    selectRole: { kind: "number", num: 3 },
    indicators: frontRowIndicators("Rec Arm", "yellow", "fastForward"),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "front", col: 2 },
  },
  {
    id: "sw4",
    kind: "stompswitch",
    name: "4",
    controlId: ControlId.Stompswitch4,
    selectRole: { kind: "number", num: 4 },
    indicators: frontRowIndicators("Click", "white", "stop"),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "front", col: 3 },
  },
  {
    id: "sw5",
    kind: "stompswitch",
    name: "5",
    controlId: ControlId.Stompswitch5,
    selectRole: { kind: "number", num: 5 },
    indicators: frontRowIndicators("Patch ▼", "yellow", "play"),
    defaultIndicator: "bottom",
    placement: { kind: "panel", row: "front", col: 4 },
  },
  {
    id: "sw6",
    kind: "stompswitch",
    name: "6",
    controlId: ControlId.Stompswitch6,
    selectRole: { kind: "number", num: 6 },
    indicators: frontRowIndicators("Patch ▲", "yellow", "record"),
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
