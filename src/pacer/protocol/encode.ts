import { computeChecksum } from "./checksum";
import {
  Command,
  CONTROL_MODE_ELEMENT,
  CURRENT_PRESET_INDEX,
  ControlId,
  DEVICE_ID,
  MANUFACTURER_ID,
  SYSEX_END,
  SYSEX_START,
  Target,
} from "./constants";
import type { LedConfig, PacerConfig, PresetMidiSetting, Step } from "./types";

function sortedNumericKeys(record: Partial<Record<number, unknown>>): number[] {
  return Object.keys(record)
    .map(Number)
    .sort((a, b) => a - b);
}

/** Frames one Pacer SysEx message: `F0 <manufacturer> <device> cmd tgt idx obj ...fieldBytes checksum F7`. */
function frameMessage(cmd: number, tgt: number, idx: number, obj: number, fieldBytes: number[]): Uint8Array {
  const covered = [cmd, tgt, idx, obj, ...fieldBytes];
  const checksum = computeChecksum(covered);
  return Uint8Array.from([SYSEX_START, ...MANUFACTURER_ID, DEVICE_ID, ...covered, checksum, SYSEX_END]);
}

function buildNameMessage(idx: number, name: string): Uint8Array {
  const chars = Array.from(name).map((c) => c.charCodeAt(0));
  return frameMessage(Command.Set, Target.Preset, idx, ControlId.Name, [0x01, chars.length, ...chars]);
}

function buildControlModeMessage(idx: number, controlId: number, mode: number): Uint8Array {
  return frameMessage(Command.Set, Target.Preset, idx, controlId, [CONTROL_MODE_ELEMENT, 1, mode]);
}

/** Encodes a step's 6 sub-fields as the fixed 23-byte window `decodeStepFields` expects: 5 filler'd fields + a final unfillered one. */
function buildStepMessage(idx: number, controlId: number, stepNumber: number, step: Step): Uint8Array {
  const base = (stepNumber - 1) * 6 + 1;
  // One elm/len/value[/reserved] field per row, mirroring the wire format.
  // prettier-ignore
  const fields = [
    base, 1, step.channel, 0,
    base + 1, 1, step.msgType, 0,
    base + 2, 1, step.data[0], 0,
    base + 3, 1, step.data[1], 0,
    base + 4, 1, step.data[2], 0,
    base + 5, 1, step.active ? 1 : 0,
  ];
  return frameMessage(Command.Set, Target.Preset, idx, controlId, fields);
}

/** Encodes a preset MIDI setting's 5 sub-fields as the fixed 19-byte window `decodeMidiSettingFields` expects. */
function buildMidiSettingMessage(idx: number, settingNumber: number, setting: PresetMidiSetting): Uint8Array {
  const base = (settingNumber - 1) * 6 + 1;
  // One elm/len/value[/reserved] field per row, mirroring the wire format.
  // prettier-ignore
  const fields = [
    base, 1, setting.channel, 0,
    base + 1, 1, setting.msgType, 0,
    base + 2, 1, setting.data[0], 0,
    base + 3, 1, setting.data[1], 0,
    base + 4, 1, setting.data[2],
  ];
  return frameMessage(Command.Set, Target.Preset, idx, ControlId.Midi, fields);
}

/** Encodes a step's 4 LED sub-fields (midi ctrl, active color, inactive color, position). Unset fields default to 0. */
function buildLedMessage(idx: number, controlId: number, stepNumber: number, led: LedConfig): Uint8Array {
  const base = 0x40 + (stepNumber - 1) * 4;
  // One elm/len/value[/reserved] field per row, mirroring the wire format.
  // prettier-ignore
  const fields = [
    base, 1, led.midiFeedback ?? 0, 0,
    base + 1, 1, led.activeColor ?? 0, 0,
    base + 2, 1, led.inactiveColor ?? 0, 0,
    base + 3, 1, led.position ?? 0,
  ];
  return frameMessage(Command.Set, Target.Preset, idx, controlId, fields);
}

function concatMessages(messages: Uint8Array[]): Uint8Array {
  const totalLength = messages.reduce((sum, m) => sum + m.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const m of messages) {
    result.set(m, offset);
    offset += m.length;
  }
  return result;
}

/**
 * Serializes a PacerConfig back to a raw SysEx byte stream. Message order is
 * deterministic (ascending preset/control/step) for readable diffs, but
 * doesn't need to match how the device itself would batch elements into
 * messages — each message is a fully self-contained SET, so the hardware
 * doesn't care how the elements are grouped, only that every needed elm gets
 * its own valid message somewhere in the stream.
 */
export function encodeSysex(config: PacerConfig): Uint8Array {
  return concatMessages(encodeSysexMessages(config));
}

/** The same stream as `encodeSysex`, as its individual `F0 … F7` messages (e.g. to send one at a time). */
export function encodeSysexMessages(config: PacerConfig): Uint8Array[] {
  const messages: Uint8Array[] = [];

  for (const idx of sortedNumericKeys(config.presets)) {
    const preset = config.presets[idx]!;

    if (preset.name !== undefined) {
      messages.push(buildNameMessage(idx, preset.name));
    }

    for (const controlId of sortedNumericKeys(preset.controls)) {
      const control = preset.controls[controlId]!;

      if (control.controlMode !== undefined) {
        messages.push(buildControlModeMessage(idx, controlId, control.controlMode));
      }
      for (const stepNumber of sortedNumericKeys(control.steps)) {
        messages.push(buildStepMessage(idx, controlId, stepNumber, control.steps[stepNumber]!));
      }
      for (const stepNumber of sortedNumericKeys(control.led)) {
        messages.push(buildLedMessage(idx, controlId, stepNumber, control.led[stepNumber]!));
      }
    }

    for (const settingNumber of sortedNumericKeys(preset.midiSettings)) {
      messages.push(buildMidiSettingMessage(idx, settingNumber, preset.midiSettings[settingNumber]!));
    }
  }

  for (const field of config.globalFields) {
    messages.push(frameMessage(Command.Set, Target.Global, field.idx, field.obj, [field.elm, ...field.data]));
  }

  return messages;
}

/**
 * The Set messages that write only the given presets (no global settings) to a Pacer. Each
 * preset keeps its own `idx`, so it lands in the same slot.
 */
export function encodePresetMessages(config: PacerConfig, presetIndices: readonly number[]): Uint8Array[] {
  const presets: PacerConfig["presets"] = {};
  for (const idx of presetIndices) {
    const preset = config.presets[idx];
    if (preset) presets[idx] = preset;
  }
  return encodeSysexMessages({ presets, globalFields: [] });
}

/**
 * The Set messages that write preset `idx` of `config` into the Pacer's Current slot (idx 0), its
 * working copy of the loaded preset. Writing a preset's own slot doesn't update Current (observed
 * on hardware), so when the Pacer has that preset loaded, this makes the new version take effect.
 */
export function encodePresetAsCurrentMessages(config: PacerConfig, idx: number): Uint8Array[] {
  const preset = config.presets[idx];
  if (!preset) return [];
  return encodeSysexMessages({
    presets: { [CURRENT_PRESET_INDEX]: { ...preset, index: CURRENT_PRESET_INDEX } },
    globalFields: [],
  });
}
