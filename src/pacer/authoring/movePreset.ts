import { isUserPresetIndex, presetIndexToLabel } from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";
import { isPlainStepping, whatWasLost, presetTransitions } from "../analysis";
import { clearPreset, copyPreset, isSparePreset, setJump } from "../editing";
import type { RouteResult } from "./change";

/**
 * Moves a preset into another slot, with everything that led to it following.
 *
 * A state's copies land wherever the app found room, which is rarely where you'd have put them —
 * the looper's three copies scattered through banks B and D rather than sitting together. Moving
 * one is a copy, a clear, and then the part that can't be done by hand without missing something:
 * every Preset Select anywhere in the configuration that named the old slot now names the new one.
 *
 * Relative stepping is deliberately left alone. Next/previous names a direction, not a preset, so
 * there's nothing in it to repoint — the preset that steps to its neighbour now steps to whatever
 * its new neighbour is, which is what stepping means.
 */
export function movePreset(config: PacerConfig, from: number, to: number): RouteResult {
  if (!isUserPresetIndex(from) || !isUserPresetIndex(to)) {
    return { ok: false, error: "Presets move between the Pacer's own 24 slots." };
  }
  if (from === to) return { ok: true, config };
  if (!isSparePreset(config.presets[to])) {
    return { ok: false, error: `${presetIndexToLabel(to)} has something in it. Clear it first, or pick an empty one.` };
  }

  let moved = clearPreset(copyPreset(config, from, to), from);
  const graph = presetTransitions(config);
  for (const edge of graph.edges) {
    if (edge.target.kind !== "preset" || edge.target.index !== from) continue;
    if (isPlainStepping(config, edge)) continue;
    moved = setJump(moved, edge.from, edge.controlId, edge.stepNumber, to);
  }

  // A renumbering, held to the strongest version of the round trip: the same design, slots renamed.
  const lost = whatWasLost(config, moved, { kind: "renumbering", moved: { [from]: to } });
  if (lost) return { ok: false, error: lost };
  return { ok: true, config: moved };
}
