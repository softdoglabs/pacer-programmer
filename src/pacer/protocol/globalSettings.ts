import type { PacerConfig } from "./types";

/*
 * Targeted reads of the few Global-target settings the simulator needs. Global fields are
 * otherwise kept opaque (see OpaqueGlobalField). Element codes are from the reference project's
 * sysex.md: Global idx 0 = "Current", 1-4 = Global Preset 1-4. On obj 0x01 ("Global Setting"),
 * elm 0x01 = Global Channel, and on idx 0, elm 0x31 = the current global config (1-4), elm 0x1A =
 * the active preset kind, and elm 0x1E = the current user preset.
 */
const GLOBAL_SETTING_OBJ = 0x01;
const GLOBAL_CHANNEL_ELM = 0x01;
const CURRENT_GLOBAL_CONFIG_ELM = 0x31;
const ACTIVE_PRESET_KIND_ELM = 0x1a;
const CURRENT_USER_PRESET_ELM = 0x1e;
/** `ACTIVE_PRESET_KIND_ELM` values: 0 = user preset, 1 = Track, 2 = Transport, 3/4 = their long-press variants. */
const ACTIVE_KIND_USER = 0;
const CURRENT_IDX = 0;

/** The factory global channel (MIDI channel 1), used when a config doesn't carry one. */
export const DEFAULT_GLOBAL_CHANNEL = 1;

/**
 * The value bytes of one element in a Global-target message, or undefined if absent. A message's
 * fields are `elm len value...`, each followed by one reserved byte except the last (the same
 * framing as preset messages).
 */
export function readGlobalElement(config: PacerConfig, idx: number, obj: number, elm: number): number[] | undefined {
  for (const field of config.globalFields) {
    if (field.idx !== idx || field.obj !== obj) continue;
    const bytes = [field.elm, ...field.data];
    let i = 0;
    while (i + 1 < bytes.length) {
      const e = bytes[i]!;
      const len = bytes[i + 1]!;
      if (e === elm) return bytes.slice(i + 2, i + 2 + len);
      i += 2 + len;
      if (i < bytes.length) i += 1; // reserved byte between fields
    }
  }
  return undefined;
}

/**
 * The SysEx idx (1-24 = A1-D6) of the user preset the Pacer has loaded, or undefined when it's on
 * a Track/Transport preset or the fields are missing. The reference project's sysex.md numbers
 * the current user preset 0 = A1 ... 23 = D6. Consistent with our dumps: every one has 0 here
 * and the Pacer on A1.
 */
export function activeUserPresetIndex(config: PacerConfig): number | undefined {
  const kind = readGlobalElement(config, CURRENT_IDX, GLOBAL_SETTING_OBJ, ACTIVE_PRESET_KIND_ELM)?.[0];
  const preset = readGlobalElement(config, CURRENT_IDX, GLOBAL_SETTING_OBJ, CURRENT_USER_PRESET_ELM)?.[0];
  if (kind !== ACTIVE_KIND_USER || preset === undefined || preset < 0 || preset > 23) return undefined;
  return preset + 1;
}

/** Which of Global Preset 1-4 is active (factory: 1). */
export function currentGlobalConfig(config: PacerConfig): number {
  const value = readGlobalElement(config, CURRENT_IDX, GLOBAL_SETTING_OBJ, CURRENT_GLOBAL_CONFIG_ELM)?.[0];
  return value !== undefined && value >= 1 && value <= 4 ? value : 1;
}

/**
 * The global MIDI channel (1-16) that steps set to channel 0 ("Global") transmit on. The User Guide
 * says: "When a control is programmed ... to send on the global channel (value 0), this menu
 * setting defines which MIDI channel the message is ultimately transmitted on." Stored 1-based;
 * the factory dump has 1.
 */
export function globalMidiChannel(config: PacerConfig): number {
  const value = readGlobalElement(config, currentGlobalConfig(config), GLOBAL_SETTING_OBJ, GLOBAL_CHANNEL_ELM)?.[0];
  return value !== undefined && value >= 1 && value <= 16 ? value : DEFAULT_GLOBAL_CHANNEL;
}

/** Step/setting channel byte meaning: 0 = the global channel, 1-16 = MIDI channels 1-16. */
export const GLOBAL_CHANNEL_SENTINEL = 0;

/**
 * The on-the-wire channel nibble (0-15) for a step's channel byte. Channel 0 means "Global" and
 * 1-16 are MIDI channels 1-16 (User Guide Type chart: "0=Global, 1-16"). Returns undefined for
 * an out-of-range byte.
 */
export function wireChannel(stepChannel: number, globalChannel: number): number | undefined {
  const channel = stepChannel === GLOBAL_CHANNEL_SENTINEL ? globalChannel : stepChannel;
  return Number.isInteger(channel) && channel >= 1 && channel <= 16 ? channel - 1 : undefined;
}
