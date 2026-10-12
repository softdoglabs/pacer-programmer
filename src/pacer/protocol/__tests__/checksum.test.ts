// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { describe, expect, it } from "vitest";
import { computeChecksum } from "../checksum";

describe("computeChecksum", () => {
  it("matches a hand-verified example from the factory-presets fixture", () => {
    // cmd=SET tgt=PRESET idx=0 obj=NAME elm=1 len=5 "PRGM1" -> checksum 0x10
    const covered = [0x01, 0x01, 0x00, 0x01, 0x01, 0x05, 0x50, 0x52, 0x47, 0x4d, 0x31];
    expect(computeChecksum(covered)).toBe(0x10);
  });

  it("makes covered bytes + checksum sum to a multiple of 128", () => {
    const covered = [1, 2, 3, 250, 127, 64];
    const cs = computeChecksum(covered);
    expect(cs).toBeGreaterThanOrEqual(0);
    expect(cs).toBeLessThan(128);
    const total = covered.reduce((a, b) => a + b, 0) + cs;
    expect(total % 128).toBe(0);
  });

  it("is stable under bytes that already sum to a multiple of 128", () => {
    expect(computeChecksum([128])).toBe(0);
    expect(computeChecksum([64, 64])).toBe(0);
  });
});
