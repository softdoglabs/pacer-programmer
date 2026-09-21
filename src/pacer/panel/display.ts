import { SPECIAL_PRESETS, type DeviceMode } from "../device";
import { presetIndexToLabel } from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";
import type { DisplayState } from "./types";

/**
 * The 2-line display. On a user preset: its 5-character name and its label (e.g. "A1"). In
 * preset select: "BANK" and the pending bank, blinking. In Track/Transport: the mode, plus the
 * remembered preset [Preset] returns to. The special-mode texts are our own choice; the real
 * firmware's aren't documented.
 */
export function displayState(
  config: PacerConfig,
  activePresetIndex: number,
  mode: DeviceMode,
  pendingBank: number,
): DisplayState {
  const label = presetIndexToLabel(activePresetIndex);
  switch (mode) {
    case "user":
      return {
        line1: (config.presets[activePresetIndex]?.name ?? "").padEnd(5, " ").slice(0, 5),
        line2: label,
        line2Blinking: false,
      };
    case "presetSelect":
      return { line1: "BANK", line2: `${"ABCD"[pendingBank] ?? "?"}-`, line2Blinking: true };
    case "track":
    case "transport":
      return { line1: SPECIAL_PRESETS[mode].displayName, line2: `↩${label}`, line2Blinking: false };
  }
}
