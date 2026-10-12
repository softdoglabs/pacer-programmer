// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { FIRST_USER_PRESET_INDEX, LAST_USER_PRESET_INDEX } from "../protocol/constants";
import type { PacerConfig, Preset } from "../protocol/types";

/** Structural equality of plain decoded data (objects, arrays, primitives), ignoring key order. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const bKeys = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}

function samePreset(a: Preset | undefined, b: Preset | undefined): boolean {
  return deepEqual(a, b);
}

/** User presets (A1-D6) whose content differs between two configs, in slot order. */
export function changedPresets(base: PacerConfig, current: PacerConfig): number[] {
  const changed: number[] = [];
  for (let idx = FIRST_USER_PRESET_INDEX; idx <= LAST_USER_PRESET_INDEX; idx++) {
    if (!samePreset(base.presets[idx], current.presets[idx])) changed.push(idx);
  }
  return changed;
}

/** Presets whose content differs between `expected` and what was read back, among `indices`. */
export function mismatchedPresets(expected: PacerConfig, actual: PacerConfig, indices: readonly number[]): number[] {
  return indices.filter((idx) => !samePreset(expected.presets[idx], actual.presets[idx]));
}
