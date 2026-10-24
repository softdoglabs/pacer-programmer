// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { CURRENT_PRESET_INDEX } from "../protocol/constants";
import type { PacerConfig } from "../protocol/types";
import { isPlainStepping, presetTransitions, type TransitionEdge, type TransitionGraph } from "./transitions";

/*
 * What enters a preset: the rule a state machine's ways in are read by.
 *
 * It used to be written out wherever it was needed — recovery had one copy, authoring another — so
 * a fix to one didn't reach the other. Two of the bugs found on the owner's device were exactly
 * that: the Current slot counted as a way in, and so did plain stepping, in one copy of the rule
 * but not the other. It lives here once.
 */

/**
 * The presets that lead to `presetIndex` by name — what could have entered it.
 *
 * - **Plain stepping doesn't count.** Next/previous names a direction, not a preset. Every slot has
 *   neighbors, and C and D step on almost every preset on a real device, so counting it would make
 *   everything look entered from two places and no return could ever be recognized.
 * - **Neither does the Current slot**, for the same reason it isn't a state: it's the device's
 *   working copy of whichever preset is loaded, so its switches are a second copy of that preset's.
 *   Every real dump has one, and counting it gave everything the loaded preset leads to a phantom
 *   second way in.
 * - Nor does a preset leading to itself.
 */
export function presetEntrants(
  config: PacerConfig,
  presetIndex: number,
  graph: TransitionGraph = presetTransitions(config),
  /**
   * Edges known to go back to whatever entered the preset they leave (see `recoverMachine`). A
   * tuner copy returning to the looper copy that entered it is arriving home, not entering it.
   */
  back: ReadonlySet<TransitionEdge> = new Set(),
): number[] {
  return [
    ...new Set(
      (graph.into[presetIndex] ?? [])
        .filter(
          (e) =>
            e.from !== presetIndex && e.from !== CURRENT_PRESET_INDEX && !isPlainStepping(config, e) && !back.has(e),
        )
        .map((e) => e.from),
    ),
  ];
}
