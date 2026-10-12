// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import type { ControlId } from "../protocol/constants";
import { PACER_HARDWARE } from "./pacerHardware";
import type { IndicatorId, IndicatorSpec, LedNum, PhysicalSwitchId, SwitchSpec } from "./types";

export * from "./types";
export { PACER_HARDWARE };

const ALL: readonly SwitchSpec[] = PACER_HARDWARE;

export function switchSpec(id: PhysicalSwitchId): SwitchSpec {
  const spec = ALL.find((s) => s.id === id);
  if (!spec) throw new Error(`no hardware spec for ${id}`);
  return spec;
}

export function switchSpecForControl(controlId: number): SwitchSpec | undefined {
  return ALL.find((s) => s.controlId === controlId);
}

function controlIdsWhere(
  predicate: (s: SwitchSpec) => boolean,
  order: (s: SwitchSpec) => number,
): readonly ControlId[] {
  return ALL.filter(predicate)
    .sort((a, b) => order(a) - order(b))
    .map((s) => s.controlId)
    .filter((id): id is ControlId => id !== undefined);
}

/** A-D in bank order: the switches preset select uses to pick a bank. */
export const BANK_SWITCH_CONTROL_IDS = controlIdsWhere(
  (s) => s.selectRole?.kind === "bank",
  (s) => (s.selectRole?.kind === "bank" ? s.selectRole.bank : 0),
);

/** 1-6 in number order: the switches preset select uses to pick a preset within the bank. */
export const NUMBER_SWITCH_CONTROL_IDS = controlIdsWhere(
  (s) => s.selectRole?.kind === "number",
  (s) => (s.selectRole?.kind === "number" ? s.selectRole.num : 0),
);

/** The 10 programmable panel stompswitches (not [Preset], not rear-jack controls). */
export const STOMPSWITCH_CONTROL_IDS: readonly ControlId[] = [...NUMBER_SWITCH_CONTROL_IDS, ...BANK_SWITCH_CONTROL_IDS];

/** Panel switches in a row, left to right. */
export function panelRow(row: "back" | "front"): readonly SwitchSpec[] {
  return ALL.filter((s) => s.placement.kind === "panel" && s.placement.row === row).sort(
    (a, b) =>
      (a.placement.kind === "panel" ? a.placement.col : 0) - (b.placement.kind === "panel" ? b.placement.col : 0),
  );
}

/** Rear-jack controls (external footswitches, expression pedals), in jack order. */
export function rearControls(): readonly SwitchSpec[] {
  return ALL.filter((s) => s.placement.kind === "rear").sort(
    (a, b) =>
      (a.placement.kind === "rear" ? a.placement.order : 0) - (b.placement.kind === "rear" ? b.placement.order : 0),
  );
}

const LED_NUM_TO_INDICATOR: Record<Exclude<LedNum, 0>, IndicatorId> = { 1: "bottom", 2: "middle", 3: "top" };

/**
 * The indicator a step's LED num drives on this switch, or undefined if the switch has no such
 * light or it isn't step-addressable. LED num 0 ("Default") maps to the switch's `defaultIndicator`.
 */
export function indicatorForLedNum(spec: SwitchSpec, ledNum: number): IndicatorSpec | undefined {
  const id = ledNum === 0 ? spec.defaultIndicator : LED_NUM_TO_INDICATOR[ledNum as Exclude<LedNum, 0>];
  const indicator = spec.indicators.find((i) => i.id === id);
  return indicator?.addressable ? indicator : undefined;
}

/** The bank (A=0 .. D=3) a switch picks in preset select, or undefined if it isn't a bank switch. */
export function bankSelectedBy(controlId: number): number | undefined {
  const role = switchSpecForControl(controlId)?.selectRole;
  return role?.kind === "bank" ? role.bank : undefined;
}

/** The preset number (1-6) a switch picks in preset select, or undefined if it isn't a number switch. */
export function numberSelectedBy(controlId: number): number | undefined {
  const role = switchSpecForControl(controlId)?.selectRole;
  return role?.kind === "number" ? role.num : undefined;
}

/** Whether a control is one of the 10 programmable panel stompswitches. */
export function isStompswitch(controlId: number): boolean {
  return switchSpecForControl(controlId)?.kind === "stompswitch";
}
