// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { FIRST_USER_PRESET_INDEX, LAST_USER_PRESET_INDEX } from "../protocol/constants";
import { decodeSysex } from "../protocol/decode";
import type { PacerConfig, Preset } from "../protocol/types";
import { mismatchedPresets } from "./diff";

/*
 * Bringing presets in from a file, into the configuration that's open.
 *
 * A `.syx` file needn't be a whole dump. It's a list of messages that each set a few fields of one
 * preset, so a file can hold two presets, or one switch of one preset — which is what an AI asked
 * to "change C1" most naturally writes, and what a whole dump is when all that matters in it is
 * the two presets that differ.
 *
 * It's read the way the Pacer reads it: **a message sets what it addresses and nothing else**. A
 * preset the file doesn't mention is left alone, and so is a step, a light or a load-time message
 * that a mentioned preset's messages don't cover. So sending the file to a Pacer holding this
 * configuration, and bringing it in here, come to the same thing.
 */

/** What a file holds, as far as bringing presets in from it goes. */
export interface PresetFile {
  /** The file decoded by itself: only what its messages set. */
  config: PacerConfig;
  /** The user presets (A1-D6) it says anything about, in slot order. */
  presets: number[];
  /** It addresses every one of the 24, so it can stand as a configuration by itself. */
  whole: boolean;
  /** It carries global settings, which are never brought in. */
  hasGlobals: boolean;
}

/** Reads a `.syx` file for the presets in it. Throws what `decodeSysex` throws on a bad file. */
export function readPresetFile(bytes: Uint8Array): PresetFile {
  const config = decodeSysex(bytes);
  const presets: number[] = [];
  for (let i = FIRST_USER_PRESET_INDEX; i <= LAST_USER_PRESET_INDEX; i++) if (config.presets[i]) presets.push(i);
  return {
    config,
    presets,
    whole: presets.length === LAST_USER_PRESET_INDEX - FIRST_USER_PRESET_INDEX + 1,
    hasGlobals: config.globalFields.length > 0,
  };
}

/** `onto` with everything `from` sets written over it, field by field. */
function mergedPreset(onto: Preset | undefined, from: Preset, index: number): Preset {
  const controls: Preset["controls"] = { ...onto?.controls };
  for (const [id, control] of Object.entries(from.controls)) {
    if (!control) continue;
    const was = controls[Number(id)];
    const led = { ...was?.led };
    for (const [n, fields] of Object.entries(control.led)) led[Number(n)] = { ...led[Number(n)], ...fields };
    const controlMode = control.controlMode ?? was?.controlMode;
    controls[Number(id)] = {
      ...(controlMode !== undefined ? { controlMode } : {}),
      steps: { ...was?.steps, ...structuredClone(control.steps) },
      led,
    };
  }
  const name = from.name ?? onto?.name;
  return {
    index,
    ...(name !== undefined ? { name } : {}),
    controls,
    midiSettings: { ...onto?.midiSettings, ...structuredClone(from.midiSettings) },
  };
}

/**
 * Brings the presets at `indices` in from `incoming`: whatever it sets for each is written over
 * what `config` has, and the rest of that preset stays. Only the 24 user presets; the Current slot
 * and global settings are the device's, and Send looks after Current.
 */
export function mergePresets(config: PacerConfig, incoming: PacerConfig, indices: readonly number[]): PacerConfig {
  const presets = { ...config.presets };
  for (const index of indices) {
    const from = incoming.presets[index];
    if (!from || index < FIRST_USER_PRESET_INDEX || index > LAST_USER_PRESET_INDEX) continue;
    presets[index] = mergedPreset(presets[index], from, index);
  }
  return { ...config, presets };
}

/** Of `indices`, the presets that bringing them in would actually change. */
export function presetsMergeWouldChange(
  config: PacerConfig,
  incoming: PacerConfig,
  indices: readonly number[],
): number[] {
  return mismatchedPresets(config, mergePresets(config, incoming, indices), indices);
}
