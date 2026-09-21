/**
 * Nektar Pacer SysEx protocol constants.
 *
 * These values are protocol facts (message framing, field codes, enumerations) —
 * verified against a real factory-preset capture (`fixtures/factory-presets.syx`)
 * by hand-checking checksums and field offsets. They were cross-referenced against
 * the archived, GPLv3-licensed `francoisgeorgy/pacer-editor` project's documentation
 * and source for the same reason CLAUDE.md gives for the format docs: these are
 * unencumbered protocol facts, independently reimplemented here rather than ported
 * from that project's code. See `CLAUDE.md` and `fixtures/README.md`.
 */

export const SYSEX_START = 0xf0;
export const SYSEX_END = 0xf7;

/** Nektar Technology Inc.'s 3-byte MIDI manufacturer ID. */
export const MANUFACTURER_ID = [0x00, 0x01, 0x77] as const;

/** Device/model id byte that follows the manufacturer id on every Pacer SysEx message. */
export const DEVICE_ID = 0x7f;

export const Command = {
  Set: 0x01,
  Get: 0x02,
} as const;
export type Command = (typeof Command)[keyof typeof Command];

export const Target = {
  Preset: 0x01,
  Global: 0x05,
  /** Only valid as the target of a Get (0x02) request; a full dump's replies use Preset/Global directly. */
  FullBackup: 0x7f,
} as const;
export type Target = (typeof Target)[keyof typeof Target];

/**
 * Object ids addressed within a preset (the `obj` field). Distinct from the preset
 * index itself (`idx`) and from `PresetTarget` below, which is a different
 * numbering used only inside a Preset Select action's data byte.
 */
export const ControlId = {
  Name: 0x01,
  Stompswitch1: 0x0d,
  Stompswitch2: 0x0e,
  Stompswitch3: 0x0f,
  Stompswitch4: 0x10,
  Stompswitch5: 0x11,
  Stompswitch6: 0x12,
  StompswitchA: 0x14,
  StompswitchB: 0x15,
  StompswitchC: 0x16,
  StompswitchD: 0x17,
  Footswitch1: 0x18,
  Footswitch2: 0x19,
  Footswitch3: 0x1a,
  Footswitch4: 0x1b,
  ExpressionPedal1: 0x36,
  ExpressionPedal2: 0x37,
  /** Preset-level MIDI settings (up to 16), sent when the preset loads. */
  Midi: 0x7e,
  All: 0x7f,
} as const;
export type ControlId = (typeof ControlId)[keyof typeof ControlId];

export const SWITCH_CONTROL_IDS: readonly number[] = [
  ControlId.Stompswitch1,
  ControlId.Stompswitch2,
  ControlId.Stompswitch3,
  ControlId.Stompswitch4,
  ControlId.Stompswitch5,
  ControlId.Stompswitch6,
  ControlId.StompswitchA,
  ControlId.StompswitchB,
  ControlId.StompswitchC,
  ControlId.StompswitchD,
  ControlId.Footswitch1,
  ControlId.Footswitch2,
  ControlId.Footswitch3,
  ControlId.Footswitch4,
];

export const EXPRESSION_PEDAL_CONTROL_IDS: readonly number[] = [ControlId.ExpressionPedal1, ControlId.ExpressionPedal2];

/** Element id of a control's "control mode" setting (fires all steps at once / sequence / external step select). */
export const CONTROL_MODE_ELEMENT = 0x60;

export const ControlMode = {
  AllStepsAtOnce: 0x00,
  Sequence: 0x01,
  ExternalStepSelect: 0x02,
} as const;
export type ControlMode = (typeof ControlMode)[keyof typeof ControlMode];

/**
 * Message types for a stompswitch/footswitch step. `PresetSelect` is the mechanism
 * behind the "state machine hand-compiled into presets" pattern described in
 * CLAUDE.md: it switches the Pacer's active preset directly, with nothing sent on
 * the MIDI wire — distinct from `ProgramAndBank`, which sends a real Program Change.
 */
export const SwitchMessageType = {
  Off: 0x61,
  CcTrigger: 0x40,
  CcToggle: 0x47,
  CcStep: 0x48,
  Note: 0x43,
  NoteToggle: 0x44,
  ProgramAndBank: 0x45,
  ProgramStep: 0x46,
  NrpnCoarse: 0x57,
  NrpnFine: 0x58,
  Mmc: 0x55,
  Relay: 0x59,
  PresetSelect: 0x62,
  PresetIncDec: 0x56,
  StepSelect: 0x63,
  StepIncDec: 0x64,
} as const;
export type SwitchMessageType = (typeof SwitchMessageType)[keyof typeof SwitchMessageType];

/** Message types for an expression pedal step. Numerically overlaps SwitchMessageType — always disambiguate by control id. */
export const ExpressionMessageType = {
  MidiCc: 0x00,
  PitchBend: 0x01,
  ChannelAftertouch: 0x02,
  NrpnCoarse: 0x03,
  NrpnFine: 0x04,
  Off: 0x61,
} as const;
export type ExpressionMessageType = (typeof ExpressionMessageType)[keyof typeof ExpressionMessageType];

/** Message types for a preset's own MIDI settings (loaded when the preset activates). */
export const PresetMidiMessageType = {
  Cc: 0x65,
  Note: 0x43,
  ProgramAndBank: 0x45,
  NrpnCoarse: 0x57,
  NrpnFine: 0x58,
  Mmc: 0x55,
  Relay: 0x59,
  Off: 0x61,
} as const;
export type PresetMidiMessageType = (typeof PresetMidiMessageType)[keyof typeof PresetMidiMessageType];

/*
 * Preset numbering. Confirmed against the reference editor's source (`presetIndexToXY`,
 * `PRESET_TARGET`) and the factory dump, whose slot 0 duplicates A1's "PRGM1" and whose
 * A1-A6 names match the User Guide's factory list only when A1 = 1.
 *
 * - A preset's SysEx `idx`: 0 = "Current" (the device's working copy of the active preset),
 *   1-24 = A1-D6.
 * - A PresetSelect step's target byte: 0 = current, 1 = track, 2 = transport, 3-26 = A1-D6.
 *   So for user presets, target = idx + 2.
 */

/** SysEx preset `idx` of the device's working copy of the active preset (not a front-panel preset). */
export const CURRENT_PRESET_INDEX = 0;
export const BANK_COUNT = 4;
export const PRESETS_PER_BANK = 6;
/** The 24 user presets, A1-D6. */
export const PRESET_COUNT = BANK_COUNT * PRESETS_PER_BANK;
export const FIRST_USER_PRESET_INDEX = 1;
export const LAST_USER_PRESET_INDEX = FIRST_USER_PRESET_INDEX + PRESET_COUNT - 1;

export function isUserPresetIndex(idx: number): boolean {
  return Number.isInteger(idx) && idx >= FIRST_USER_PRESET_INDEX && idx <= LAST_USER_PRESET_INDEX;
}

/** SysEx `idx` of a user preset, from its 0-based bank (A=0 .. D=3) and 1-based number (1-6). */
export function userPresetIndex(bank: number, num: number): number {
  if (!Number.isInteger(bank) || bank < 0 || bank >= BANK_COUNT) throw new RangeError(`bank ${bank} out of range`);
  if (!Number.isInteger(num) || num < 1 || num > PRESETS_PER_BANK)
    throw new RangeError(`preset number ${num} out of range`);
  return FIRST_USER_PRESET_INDEX + bank * PRESETS_PER_BANK + (num - 1);
}

/** 0-based bank (A=0 .. D=3) of a user preset's SysEx `idx`, or undefined for non-user slots like Current. */
export function presetBank(idx: number): number | undefined {
  return isUserPresetIndex(idx) ? Math.floor((idx - FIRST_USER_PRESET_INDEX) / PRESETS_PER_BANK) : undefined;
}

/** 1-based number within its bank (1-6) of a user preset's SysEx `idx`, or undefined for non-user slots. */
export function presetNumber(idx: number): number | undefined {
  return isUserPresetIndex(idx) ? ((idx - FIRST_USER_PRESET_INDEX) % PRESETS_PER_BANK) + 1 : undefined;
}

/** Bank letter + number ("A1" .. "D6") for a SysEx preset `idx`; "CUR" for the Current slot. */
export function presetIndexToLabel(idx: number): string {
  if (idx === CURRENT_PRESET_INDEX) return "CUR";
  const bank = presetBank(idx);
  const num = presetNumber(idx);
  if (bank === undefined || num === undefined) return `#${idx}`;
  return `${"ABCD"[bank]}${num}`;
}

/** Wraps a user preset `idx` into A1-D6 (so D6 + 1 = A1 and A1 - 1 = D6). */
export function wrapUserPresetIndex(idx: number): number {
  const offset = idx - FIRST_USER_PRESET_INDEX;
  return FIRST_USER_PRESET_INDEX + (((offset % PRESET_COUNT) + PRESET_COUNT) % PRESET_COUNT);
}

/** Labels for a PresetSelect step's target byte (see above). */
export const PresetSelectTarget = [
  "current",
  "track",
  "transport",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "B1",
  "B2",
  "B3",
  "B4",
  "B5",
  "B6",
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "D1",
  "D2",
  "D3",
  "D4",
  "D5",
  "D6",
] as const;

/** The PresetSelect target byte for A1; user preset targets run A1-D6 from here. */
export const PRESET_SELECT_FIRST_USER_TARGET = 3;

/** SysEx preset `idx` a PresetSelect target byte jumps to, or undefined for the reserved targets (current/track/transport). */
export function presetSelectTargetToIndex(target: number): number | undefined {
  const idx = target - PRESET_SELECT_FIRST_USER_TARGET + FIRST_USER_PRESET_INDEX;
  return isUserPresetIndex(idx) ? idx : undefined;
}

/** The PresetSelect target byte that jumps to a user preset's SysEx `idx`. */
export function presetIndexToPresetSelectTarget(idx: number): number {
  if (!isUserPresetIndex(idx)) throw new RangeError(`idx ${idx} is not a user preset`);
  return idx - FIRST_USER_PRESET_INDEX + PRESET_SELECT_FIRST_USER_TARGET;
}

export const STEPS_PER_CONTROL = 6;
