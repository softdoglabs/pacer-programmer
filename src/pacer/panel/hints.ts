// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { SPECIAL_PRESETS, type DeviceMode } from "../device";
import { bankSelectedBy, numberSelectedBy, type SwitchSpec } from "../hardware";
import { presetIndexToLabel, userPresetIndex } from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";
import { controlKindOf, summarizeControl } from "../simulator";

/**
 * What pressing a switch would do right now, as a short app-generated annotation (e.g. "PC5 →B1",
 * "Load B3", "Rewind"). This is *not* something the hardware displays; the view must present it
 * as an annotation, distinct from the printed legends. Undefined for a switch with nothing to say.
 */
export function switchHint(
  spec: SwitchSpec,
  config: PacerConfig,
  activePresetIndex: number,
  mode: DeviceMode,
  pendingBank: number,
): string | undefined {
  const last = presetIndexToLabel(activePresetIndex);
  if (spec.kind === "presetSwitch") {
    if (mode === "user") return "hold: preset select";
    return mode === "presetSelect" ? "tap: cancel" : `tap: back to ${last}`;
  }
  if (spec.controlId === undefined) return undefined;

  switch (mode) {
    case "user": {
      const kind = controlKindOf(spec.controlId);
      const control = config.presets[activePresetIndex]?.controls[spec.controlId];
      return kind && control ? summarizeControl(control, kind) : undefined;
    }
    case "presetSelect": {
      const bank = bankSelectedBy(spec.controlId);
      if (bank !== undefined) return `Bank ${"ABCD"[bank]}`;
      const num = numberSelectedBy(spec.controlId);
      return num !== undefined ? `Load ${presetIndexToLabel(userPresetIndex(pendingBank, num))}` : undefined;
    }
    case "track":
    case "transport": {
      const action = SPECIAL_PRESETS[mode].switches[spec.controlId];
      if (!action) return undefined;
      return action.kind === "daw" ? action.command : action.preset === "track" ? "Track preset" : "Transport preset";
    }
  }
}
