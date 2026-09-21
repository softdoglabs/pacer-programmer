import { computeChecksum } from "./checksum";
import { Command, DEVICE_ID, MANUFACTURER_ID, SYSEX_END, SYSEX_START, Target } from "./constants";

/**
 * Requests the Pacer's full configuration: `Get` with target `Full Backup` (0x7F), no idx/obj
 * (the same request the reference editor's `requestAllPresets` sends). The Pacer replies with a
 * stream of `Set` messages, one per field. This is the same format as fixtures/factory-presets.syx.
 */
export function buildFullDumpRequest(): Uint8Array {
  const covered = [Command.Get, Target.FullBackup];
  return Uint8Array.from([SYSEX_START, ...MANUFACTURER_ID, DEVICE_ID, ...covered, computeChecksum(covered), SYSEX_END]);
}

/**
 * Messages in a full dump from current firmware: the reference editor's FULL_DUMP_EXPECTED_BYTES
 * (a message count, despite its name), and exactly what the factory fixture contains. Other
 * firmware versions may differ, so treat it as a progress estimate, not a completion test.
 */
export const EXPECTED_FULL_DUMP_MESSAGES = 4762;

const PACER_PREFIX = [SYSEX_START, ...MANUFACTURER_ID, DEVICE_ID];

/** Whether bytes are one complete Pacer SysEx message carrying data (a `Set`, which is what dump replies use). */
export function isPacerDataMessage(bytes: ArrayLike<number>): boolean {
  if (bytes.length < PACER_PREFIX.length + 3 || bytes[bytes.length - 1] !== SYSEX_END) return false;
  return PACER_PREFIX.every((b, i) => bytes[i] === b) && bytes[PACER_PREFIX.length] === Command.Set;
}
