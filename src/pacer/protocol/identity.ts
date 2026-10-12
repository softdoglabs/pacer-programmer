// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { SYSEX_END, SYSEX_START } from "./constants";

/*
 * MIDI Device Inquiry (Universal Non-Real-Time SysEx, sub-IDs 06 01 / 06 02), part of the
 * MIDI 1.0 spec rather than Nektar's protocol. The Pacer's firmware version isn't in its
 * configuration dump. This is the standard way to ask a device for it, but whether the Pacer
 * answers is unverified until it's tried on hardware.
 */
const UNIVERSAL_NON_REALTIME = 0x7e;
const ALL_DEVICES = 0x7f;
const GENERAL_INFORMATION = 0x06;
const IDENTITY_REQUEST = 0x01;
const IDENTITY_REPLY = 0x02;

export function buildIdentityRequest(): Uint8Array {
  return Uint8Array.from([
    SYSEX_START,
    UNIVERSAL_NON_REALTIME,
    ALL_DEVICES,
    GENERAL_INFORMATION,
    IDENTITY_REQUEST,
    SYSEX_END,
  ]);
}

export interface DeviceIdentity {
  /** 1 byte, or 3 bytes starting with 00 (extended IDs; Nektar's is 00 01 77). */
  manufacturerId: number[];
  /** 14-bit values sent LSB first. */
  family: number;
  model: number;
  /** The 4 software revision bytes, as sent (the Pacer sends ASCII digits, e.g. "0101"). */
  version: number[];
}

/** Parses an Identity Reply: `F0 7E <device> 06 02 <manufacturer> <family:2> <model:2> <version:4> F7`. */
export function parseIdentityReply(bytes: ArrayLike<number>): DeviceIdentity | undefined {
  const b = Array.from(bytes);
  if (
    b[0] !== SYSEX_START ||
    b[1] !== UNIVERSAL_NON_REALTIME ||
    b[3] !== GENERAL_INFORMATION ||
    b[4] !== IDENTITY_REPLY
  ) {
    return undefined;
  }
  const idLength = b[5] === 0x00 ? 3 : 1;
  const manufacturerId = b.slice(5, 5 + idLength);
  const rest = b.slice(5 + idLength);
  if (rest.length < 9 || rest[8] !== SYSEX_END) return undefined;
  return {
    manufacturerId,
    family: rest[0]! | (rest[1]! << 7),
    model: rest[2]! | (rest[3]! << 7),
    version: rest.slice(4, 8),
  };
}

/** Nektar's MIDI manufacturer ID. */
export const NEKTAR_MANUFACTURER_ID = [0x00, 0x01, 0x77];

export function isNektar(identity: DeviceIdentity): boolean {
  return identity.manufacturerId.join() === NEKTAR_MANUFACTURER_ID.join();
}

/**
 * The version as the device reports it. The Pacer sends ASCII digits (observed: 30 31 30 31, so
 * "0101"), which are shown as text. Anything non-printable is shown as dotted byte values.
 */
export function formatFirmwareVersion(identity: DeviceIdentity): string {
  const printable = identity.version.every((b) => b >= 0x20 && b <= 0x7e);
  return printable ? String.fromCharCode(...identity.version) : identity.version.join(".");
}
