// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { STEPS_PER_CONTROL, SWITCH_CONTROL_IDS, SwitchMessageType } from "../protocol/constants";
import type { PacerConfig, Preset, Step } from "../protocol/types";

/*
 * Presets that are really one state.
 *
 * The Pacer can't remember anything, so "the looper is running, and I came from preset A1" has to
 * be a preset of its own — and the same state entered from twelve places costs twelve near-
 * identical presets, differing only in where they go back to. That's the duplication this project
 * exists to undo: recognizing those twelve as one state is what lets them be authored once.
 *
 * The rule: two presets are the same state when everything about them matches except *where their
 * navigation leads*. Navigation steps are compared by shape, not target — a switch that is a
 * Preset Select in both presets matches whichever preset each one points at, while a preset that
 * lacks that switch entirely does not. A preset's name is deliberately excluded, so instances can
 * be named apart on a 5-character display without stopping them being one state.
 */

/** A group of presets that behave identically apart from their navigation. */
export interface PresetState {
  /** Preset indices in this state, ascending. A single-member group is just a preset. */
  members: number[];
  /**
   * The name shared by every member, if they share one — the closest thing to the state's own
   * name that the dump can hold, since nothing outside the presets is persisted.
   */
  name?: string;
}

/** Navigation steps keep their type (and Inc/Dec direction) but lose their destination. */
function normalizeStep(step: Step): unknown {
  const { channel, msgType, data, active } = step;
  if (msgType === SwitchMessageType.PresetSelect) return { msgType, active, target: "*" };
  if (msgType === SwitchMessageType.PresetIncDec) return { msgType, active, direction: data[0] };
  return { channel, msgType, data, active };
}

/**
 * Everything about a preset that isn't its name or its destinations, in a fixed order so two
 * presets with the same behavior produce the same string whatever order their fields arrived in.
 */
function behaviorKey(preset: Preset): string {
  const controls = SWITCH_CONTROL_IDS.map((id) => {
    const control = preset.controls[id];
    if (!control) return null;
    const steps = [];
    for (let n = 1; n <= STEPS_PER_CONTROL; n++) {
      const step = control.steps[n];
      steps.push(step ? normalizeStep(step) : null);
      // The LED belongs to the behavior: two presets that light a switch differently are not
      // the same state, even if they send the same thing.
      steps.push(control.led[n] ?? null);
    }
    return { id, mode: control.controlMode ?? 0, steps };
  });
  const midi = [];
  for (let n = 1; n <= 16; n++) {
    const setting = preset.midiSettings[n];
    midi.push(setting ? { c: setting.channel, t: setting.msgType, d: setting.data } : null);
  }
  return JSON.stringify({ controls, midi });
}

/**
 * Groups a configuration's presets into states. Every preset appears in exactly one group, so a
 * preset unlike any other is a state with one member — the map draws those as plain presets.
 */
export function presetStates(config: PacerConfig): PresetState[] {
  const byKey = new Map<string, number[]>();
  for (const preset of Object.values(config.presets)) {
    if (!preset) continue;
    const key = behaviorKey(preset);
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(preset.index);
  }

  const states: PresetState[] = [];
  for (const members of byKey.values()) {
    members.sort((a, b) => a - b);
    const names = members.map((i) => config.presets[i]?.name);
    const shared = names.every((n) => n === names[0]) ? names[0] : undefined;
    states.push({ members, ...(shared !== undefined ? { name: shared } : {}) });
  }
  return states.sort((a, b) => a.members[0]! - b.members[0]!);
}
