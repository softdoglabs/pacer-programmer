import type { ControlMode } from "./constants";

/**
 * One of a control's up to 6 steps. `active` gates whether the step fires.
 * `msgType` is deliberately untyped as a union here — its meaning depends on
 * which kind of control owns it (switch vs. expression pedal), see
 * `SwitchMessageType` / `ExpressionMessageType` in constants.ts.
 */
export interface Step {
  channel: number;
  msgType: number;
  data: [number, number, number];
  active: boolean;
}

/** Per-step LED feedback config. All fields are independently optional — the Pacer sends them as separate SysEx fields. */
export interface LedConfig {
  /**
   * The LED menu's "MIDI" setting (Off/On), not a controller number: with it on, the light's two
   * colors follow the step's own assigned message *received* on USB MIDI rather than what the
   * switch itself sends — the User Guide's "MIDI LED feedback for MIDI CC messages" (Control Edit
   * -> LED, Chart 1). Kept as the raw byte, since only 0 (Off) has been seen in a dump.
   */
  midiFeedback?: number;
  activeColor?: number;
  inactiveColor?: number;
  /** LED position on multi-LED footswitches: 0=default, 1=bottom, 2=middle, 3=top. */
  position?: number;
}

/** A stompswitch, footswitch, or expression pedal's full configuration within one preset. */
export interface SwitchControl {
  controlMode?: ControlMode;
  /** Keyed 1-6 (step number), matching the hardware's own step numbering. Sparse: absent steps are unset on the device. */
  steps: Partial<Record<number, Step>>;
  led: Partial<Record<number, LedConfig>>;
}

/** One of a preset's own MIDI settings (fired when the preset is loaded, not tied to a switch press). */
export interface PresetMidiSetting {
  channel: number;
  msgType: number;
  data: [number, number, number];
}

export interface Preset {
  /** SysEx preset `idx`: 0 = Current (working copy), 1-24 = A1-D6. See `presetIndexToLabel`. */
  index: number;
  name?: string;
  /** Keyed by ControlId. */
  controls: Partial<Record<number, SwitchControl>>;
  /** Keyed 1-16 (setting number). */
  midiSettings: Partial<Record<number, PresetMidiSetting>>;
}

/**
 * A Global-target SysEx field this codebase doesn't yet assign meaning to
 * (see CLAUDE.md's open question on global config scope). Preserved verbatim
 * — `idx`/`obj`/`elm` plus the raw bytes between `elm` and the checksum — so
 * decode -> encode is still lossless even for fields we haven't modeled yet.
 */
export interface OpaqueGlobalField {
  idx: number;
  obj: number;
  elm: number;
  data: number[];
}

/**
 * The full, lossless mirror of a Pacer SysEx dump — the single canonical
 * document described in CLAUDE.md. Everything the UI (including the
 * simulator) reads comes from this structure; nothing else is persisted.
 */
export interface PacerConfig {
  /** Keyed by SysEx preset `idx` (0 = Current, 1-24 = A1-D6). Sparse: a partial dump may only touch some presets. */
  presets: Partial<Record<number, Preset>>;
  globalFields: OpaqueGlobalField[];
}

export function createEmptyPacerConfig(): PacerConfig {
  return { presets: {}, globalFields: [] };
}

export function getOrCreatePreset(config: PacerConfig, index: number): Preset {
  let preset = config.presets[index];
  if (!preset) {
    preset = { index, controls: {}, midiSettings: {} };
    config.presets[index] = preset;
  }
  return preset;
}

export function getOrCreateControl(preset: Preset, controlId: number): SwitchControl {
  let control = preset.controls[controlId];
  if (!control) {
    control = { steps: {}, led: {} };
    preset.controls[controlId] = control;
  }
  return control;
}
