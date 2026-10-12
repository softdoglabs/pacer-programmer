// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/**
 * The Pacer's SysEx checksum: a 7-bit value (MIDI data bytes can't use bit 7)
 * such that `sum(coveredBytes) + checksum` is a multiple of 128. Covers the
 * message body from `cmd` through the last data byte — it does NOT cover the
 * leading manufacturer id (`00 01 77`) or device id (`0x7F`) bytes, nor the
 * `0xF0`/`0xF7` framing. Verified by hand against `fixtures/factory-presets.syx`.
 */
export function computeChecksum(bytes: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) {
    sum += bytes[i]!;
  }
  return (128 - (sum % 128)) % 128;
}
