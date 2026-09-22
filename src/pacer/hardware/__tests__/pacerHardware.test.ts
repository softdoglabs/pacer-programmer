import { describe, expect, it } from "vitest";
import { ControlId, EXPRESSION_PEDAL_CONTROL_IDS, SWITCH_CONTROL_IDS } from "../../protocol/constants";
import {
  BANK_SWITCH_CONTROL_IDS,
  NUMBER_SWITCH_CONTROL_IDS,
  PACER_HARDWARE,
  STOMPSWITCH_CONTROL_IDS,
  indicatorForLedNum,
  panelRow,
  rearControls,
  switchSpec,
  type SwitchSpec,
} from "..";

const ALL: readonly SwitchSpec[] = PACER_HARDWARE;

describe("PACER_HARDWARE invariants", () => {
  it("has unique switch ids and unique control ids", () => {
    const ids = ALL.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const controlIds = ALL.flatMap((s) => (s.controlId === undefined ? [] : [s.controlId]));
    expect(new Set(controlIds).size).toBe(controlIds.length);
  });

  it("covers every programmable control the protocol knows, and only [Preset] is unprogrammable", () => {
    const controlIds = ALL.flatMap((s) => (s.controlId === undefined ? [] : [s.controlId]));
    expect([...controlIds].sort()).toEqual([...SWITCH_CONTROL_IDS, ...EXPRESSION_PEDAL_CONTROL_IDS].sort());
    expect(ALL.filter((s) => s.controlId === undefined).map((s) => s.id)).toEqual(["preset"]);
  });

  it("gives each switch unique indicator positions, and a defaultIndicator it actually has", () => {
    for (const spec of ALL) {
      const positions = spec.indicators.map((i) => i.id);
      expect(new Set(positions).size, spec.id).toBe(positions.length);
      if (spec.defaultIndicator) expect(positions, spec.id).toContain(spec.defaultIndicator);
    }
  });

  it("assigns preset-select roles to exactly banks A-D and numbers 1-6", () => {
    expect(BANK_SWITCH_CONTROL_IDS).toEqual([
      ControlId.StompswitchA,
      ControlId.StompswitchB,
      ControlId.StompswitchC,
      ControlId.StompswitchD,
    ]);
    expect(NUMBER_SWITCH_CONTROL_IDS).toEqual([
      ControlId.Stompswitch1,
      ControlId.Stompswitch2,
      ControlId.Stompswitch3,
      ControlId.Stompswitch4,
      ControlId.Stompswitch5,
      ControlId.Stompswitch6,
    ]);
    expect(STOMPSWITCH_CONTROL_IDS).toHaveLength(10);
  });

  it("lays out Preset + A-D on the back row and 1-6 on the front row, with no column collisions", () => {
    expect(panelRow("back").map((s) => s.name)).toEqual(["Preset", "A", "B", "C", "D"]);
    expect(panelRow("front").map((s) => s.name)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(rearControls().map((s) => s.name)).toEqual(["FS1", "FS2", "FS3", "FS4", "EXP1", "EXP2"]);
  });

  it("marks A-D with badges and 1-6 with numerals", () => {
    expect(panelRow("back").map((s) => s.marking)).toEqual([undefined, "badge", "badge", "badge", "badge"]);
    expect(panelRow("front").every((s) => s.marking === "numeral")).toBe(true);
  });

  it("only gives lights to panel switches, and every panel switch has an RGB bar", () => {
    for (const spec of ALL) {
      if (spec.placement.kind === "rear") expect(spec.indicators, spec.id).toEqual([]);
      else expect(spec.indicators.find((i) => i.id === "bottom")?.color, spec.id).toEqual({ kind: "variable" });
    }
  });

  it("B's stop/play/record legend is green ink (confirmed on hardware)", () => {
    expect(switchSpec("swB").indicators.find((i) => i.id === "middle")?.color).toEqual({
      kind: "variable",
      ink: "green",
    });
  });

  it("front-row text legends are yellow ink except Click, which is white (confirmed on hardware)", () => {
    const textInk = (id: Parameters<typeof switchSpec>[0]) =>
      switchSpec(id).indicators.find((i) => i.id === "top")?.color;
    for (const id of ["sw1", "sw2", "sw3", "sw5", "sw6"] as const)
      expect(textInk(id)).toEqual({ kind: "variable", ink: "yellow" });
    expect(textInk("sw4")).toEqual({ kind: "variable", ink: "white" });
  });

  it("records evidence for every indicator", () => {
    for (const spec of ALL)
      for (const i of spec.indicators) expect(i.evidence.length, `${spec.id}.${i.id}`).toBeGreaterThan(0);
  });
});

describe("indicatorForLedNum", () => {
  it("maps 1/2/3 to bottom/middle/top and Default (0) to the bar", () => {
    const sw1 = switchSpec("sw1");
    expect(indicatorForLedNum(sw1, 0)?.id).toBe("bottom");
    expect(indicatorForLedNum(sw1, 1)?.id).toBe("bottom");
    expect(indicatorForLedNum(sw1, 2)?.id).toBe("middle");
    expect(indicatorForLedNum(sw1, 3)?.id).toBe("top");
  });

  it("addresses the back row's printed legend with LED num 2, and has nothing on 3", () => {
    const swA = switchSpec("swA");
    expect(indicatorForLedNum(swA, 0)?.id).toBe("bottom");
    expect(indicatorForLedNum(swA, 1)?.id).toBe("bottom");
    expect(indicatorForLedNum(swA, 2)?.id).toBe("middle"); // its printed legend (owner-confirmed)
    expect(indicatorForLedNum(swA, 3)).toBeUndefined(); // no third light on the back row
  });

  it("returns undefined for lights a switch lacks or that steps can't address", () => {
    expect(indicatorForLedNum(switchSpec("fs1"), 0)).toBeUndefined();
    expect(indicatorForLedNum(switchSpec("sw1"), 9)).toBeUndefined();
  });
});
