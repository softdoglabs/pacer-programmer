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

export const EXPRESSION_PEDAL_CONTROL_IDS: readonly number[] = [
  ControlId.ExpressionPedal1,
  ControlId.ExpressionPedal2,
];

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

/**
 * Target preset encoding used inside a `PresetSelect` step's data byte:
 * `(bank * 6) + num`, offset by three reserved low values. This is *not* the
 * same numbering as the `idx` field used to address a preset in a SysEx
 * message — see the module doc comment above.
 */
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

/**
 * Bank letter + number for a preset's own `idx` (0-based: A1=0 .. D6=23). Slots beyond the
 * 24 user presets (e.g. idx 24, "SEQNC" in the factory dump) have no front-panel label and
 * are shown by index instead.
 */
export function presetIndexToLabel(idx: number): string {
  if (idx < 0 || idx >= PRESET_COUNT) return `#${idx}`;
  const bank = "ABCD"[Math.floor(idx / 6)];
  const num = (idx % 6) + 1;
  return `${bank}${num}`;
}

export const PRESET_COUNT = 24;
export const STEPS_PER_CONTROL = 6;
