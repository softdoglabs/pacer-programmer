import { computeChecksum } from "./checksum";
import {
  CONTROL_MODE_ELEMENT,
  ControlId,
  type ControlMode,
  DEVICE_ID,
  EXPRESSION_PEDAL_CONTROL_IDS,
  MANUFACTURER_ID,
  SWITCH_CONTROL_IDS,
  SYSEX_END,
  SYSEX_START,
  Target,
} from "./constants";
import {
  createEmptyPacerConfig,
  getOrCreateControl,
  getOrCreatePreset,
  type LedConfig,
  type PacerConfig,
} from "./types";

/** A single, framing-verified SysEx message with its manufacturer/device/checksum bytes already stripped. */
export interface RawMessage {
  /** Byte offset of this message's leading 0xF0 in the source buffer — for error messages. */
  offset: number;
  cmd: number;
  tgt: number;
  idx: number;
  /** `undefined` for the rare bucket-init message that carries only cmd/tgt/idx and no checksum. */
  obj?: number;
  elm?: number;
  /** Bytes from (and including) `elm` up to (excluding) the checksum. Empty when `obj`/`elm` are absent. */
  data: Uint8Array;
}

export class SysexDecodeError extends Error {}

/**
 * Split a raw SysEx dump into individual Pacer messages, validating framing,
 * manufacturer/device id, and checksum for each. Throws on the first
 * malformed message — a corrupt or non-Pacer dump should fail loudly rather
 * than silently produce a partial config.
 */
export function splitSysexMessages(bytes: Uint8Array): RawMessage[] {
  const messages: RawMessage[] = [];
  let i = 0;

  while (true) {
    const start = bytes.indexOf(SYSEX_START, i);
    if (start < 0) break;

    const end = bytes.indexOf(SYSEX_END, start + 1);
    if (end < 0) {
      throw new SysexDecodeError(`unterminated SysEx message starting at byte ${start} (no 0xF7 found)`);
    }

    const body = bytes.subarray(start + 1, end);
    if (
      body.length < 4 ||
      body[0] !== MANUFACTURER_ID[0] ||
      body[1] !== MANUFACTURER_ID[1] ||
      body[2] !== MANUFACTURER_ID[2] ||
      body[3] !== DEVICE_ID
    ) {
      throw new SysexDecodeError(
        `message at byte ${start} is not a Nektar Pacer message (manufacturer/device id mismatch)`,
      );
    }

    const payload = body.subarray(4); // cmd, tgt, idx, [obj, elm, ...data, checksum]

    if (payload.length < 3) {
      throw new SysexDecodeError(`message at byte ${start} is too short to contain cmd/tgt/idx (${payload.length} bytes)`);
    }

    const cmd = payload[0]!;
    const tgt = payload[1]!;
    const idx = payload[2]!;

    if (payload.length === 3) {
      // Bucket-init marker: addresses a target/idx with no obj, elm, data, or checksum.
      messages.push({ offset: start, cmd, tgt, idx, data: new Uint8Array(0) });
      i = end + 1;
      continue;
    }

    const checksumByte = payload[payload.length - 1]!;
    const covered = payload.subarray(0, payload.length - 1);
    const expected = computeChecksum(covered);
    if (expected !== checksumByte) {
      throw new SysexDecodeError(
        `checksum mismatch at byte ${start}: expected ${expected}, got ${checksumByte}`,
      );
    }

    const obj = payload[3]!;
    const elm = payload.length > 4 ? payload[4] : undefined;
    const data = elm === undefined ? new Uint8Array(0) : payload.subarray(4, payload.length - 1);

    messages.push({ offset: start, cmd, tgt, idx, obj, elm, data });
    i = end + 1;
  }

  return messages;
}

function decodePresetName(data: Uint8Array): string {
  // data: [elm, len, ...len ASCII bytes]
  const len = data[1]!;
  let name = "";
  for (let i = 0; i < len; i++) {
    name += String.fromCharCode(data[2 + i]!);
  }
  return name;
}

interface DecodedStep {
  stepNumber: number;
  channel: number;
  msgType: number;
  data: [number, number, number];
  active: boolean;
}

/** A step's 6 sub-fields are always sent together as one fixed 23-byte window: 5 filler'd fields + a final unfillered one. */
function decodeStepFields(data: Uint8Array): DecodedStep {
  if (data.length !== 23) {
    throw new SysexDecodeError(`expected a 23-byte control step window, got ${data.length} bytes`);
  }
  const firstElm = data[0]!;
  const stepNumber = Math.floor((firstElm - 1) / 6) + 1;
  return {
    stepNumber,
    channel: data[2]!,
    msgType: data[6]!,
    data: [data[10]!, data[14]!, data[18]!],
    active: data[22]! !== 0,
  };
}

interface DecodedMidiSetting {
  settingNumber: number;
  channel: number;
  msgType: number;
  data: [number, number, number];
}

/** A preset MIDI setting's 5 sub-fields, sent as one fixed 19-byte window (4 filler'd fields + a final unfillered one). */
function decodeMidiSettingFields(data: Uint8Array): DecodedMidiSetting {
  if (data.length !== 19) {
    throw new SysexDecodeError(`expected a 19-byte MIDI setting window, got ${data.length} bytes`);
  }
  const firstElm = data[0]!;
  const settingNumber = Math.floor((firstElm - 1) / 6) + 1;
  return {
    settingNumber,
    channel: data[2]!,
    msgType: data[6]!,
    data: [data[10]!, data[14]!, data[18]!],
  };
}

const LED_FIELD_BY_OFFSET: Array<keyof LedConfig> = ["midiController", "activeColor", "inactiveColor", "position"];

/**
 * LED fields are TLV-encoded (`elm, len, ...len data bytes`) with a single
 * reserved 0x00 byte after every field except the message's last. We don't
 * rely on that reserved byte's position — an unrecognized leading byte (the
 * filler, or anything else) is simply skipped, which self-resynchronizes to
 * the next real `elm` the same way the reference implementation's decoder does.
 */
function decodeLedFields(data: Uint8Array): Map<number, Partial<LedConfig>> {
  const bySteps = new Map<number, Partial<LedConfig>>();
  let i = 0;
  while (i < data.length) {
    const elm = data[i]!;
    if (elm === 0x7f) break; // "ALL" sentinel — nothing more to read
    if (elm < 0x40 || elm > 0x57) {
      i++; // filler / unrecognized byte — skip and resynchronize
      continue;
    }
    const fieldOffset = (elm - 0x40) % 4;
    const stepNumber = (elm - 0x40 - fieldOffset) / 4 + 1;
    const len = data[i + 1]!;
    const valueBytes = data.subarray(i + 2, i + 2 + len);
    const value = len === 1 ? valueBytes[0]! : Array.from(valueBytes);
    const step = bySteps.get(stepNumber) ?? {};
    (step as Record<string, unknown>)[LED_FIELD_BY_OFFSET[fieldOffset]!] = value;
    bySteps.set(stepNumber, step);
    i += 2 + len;
  }
  return bySteps;
}

function isSwitchOrExpressionControl(obj: number): boolean {
  return SWITCH_CONTROL_IDS.includes(obj) || EXPRESSION_PEDAL_CONTROL_IDS.includes(obj);
}

function applyMessage(config: PacerConfig, message: RawMessage): void {
  if (message.obj === undefined) return; // bucket-init marker only — nothing to apply

  if (message.tgt === Target.Global) {
    if (message.elm === undefined) return;
    config.globalFields.push({
      idx: message.idx,
      obj: message.obj,
      elm: message.elm,
      data: Array.from(message.data.subarray(1)), // exclude the elm byte itself; kept opaque, see types.ts
    });
    return;
  }

  if (message.tgt !== Target.Preset) {
    throw new SysexDecodeError(`unsupported target 0x${message.tgt.toString(16)} at byte ${message.offset}`);
  }

  const preset = getOrCreatePreset(config, message.idx);

  if (message.obj === ControlId.Name) {
    preset.name = decodePresetName(message.data);
    return;
  }

  if (message.obj === ControlId.Midi) {
    if (message.elm === undefined) return;
    const setting = decodeMidiSettingFields(message.data);
    preset.midiSettings[setting.settingNumber] = {
      channel: setting.channel,
      msgType: setting.msgType,
      data: setting.data,
    };
    return;
  }

  if (isSwitchOrExpressionControl(message.obj)) {
    if (message.elm === undefined) return;
    const control = getOrCreateControl(preset, message.obj);

    if (message.elm >= 0x01 && message.elm <= 0x24) {
      const step = decodeStepFields(message.data);
      control.steps[step.stepNumber] = {
        channel: step.channel,
        msgType: step.msgType,
        data: step.data,
        active: step.active,
      };
    } else if (message.elm === CONTROL_MODE_ELEMENT) {
      control.controlMode = message.data[2]! as ControlMode;
    } else if (message.elm >= 0x40 && message.elm <= 0x57) {
      const bySteps = decodeLedFields(message.data);
      for (const [stepNumber, fields] of bySteps) {
        control.led[stepNumber] = { ...control.led[stepNumber], ...fields };
      }
    } else if (message.elm === ControlId.All) {
      // "ALL" — nothing further encoded on this message.
    } else {
      throw new SysexDecodeError(`unknown control element 0x${message.elm.toString(16)} at byte ${message.offset}`);
    }
    return;
  }

  throw new SysexDecodeError(`unknown object 0x${message.obj.toString(16)} at byte ${message.offset}`);
}

export function decodeSysex(bytes: Uint8Array): PacerConfig {
  const config = createEmptyPacerConfig();
  for (const message of splitSysexMessages(bytes)) {
    applyMessage(config, message);
  }
  return config;
}
