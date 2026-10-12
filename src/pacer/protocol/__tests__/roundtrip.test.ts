// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeSysex, splitSysexMessages } from "../decode";
import { encodeSysex } from "../encode";

const FIXTURE_PATH = fileURLToPath(new URL("../../../../fixtures/factory-presets.syx", import.meta.url));

function loadFixture(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE_PATH));
}

describe("factory-presets.syx", () => {
  it("splits into well-formed, checksum-valid messages", () => {
    const bytes = loadFixture();
    const messages = splitSysexMessages(bytes);
    expect(messages.length).toBe(4762);
  });

  it("decodes without error and finds the expected presets", () => {
    const config = decodeSysex(loadFixture());
    const presetIndices = Object.keys(config.presets)
      .map(Number)
      .sort((a, b) => a - b);

    // idx 0 = "Current" (the working copy of the active preset), 1-24 = A1-D6.
    expect(presetIndices).toEqual(Array.from({ length: 25 }, (_, i) => i));
    expect(config.presets[1]?.name).toBe("PRGM1"); // A1
    expect(config.presets[24]?.name).toBe("SEQNC"); // D6
  });

  it("decodes a stompswitch's full step/mode/LED configuration", () => {
    const config = decodeSysex(loadFixture());
    const preset = config.presets[0]!;
    const stomp1 = preset.controls[0x0d]!; // Stompswitch 1
    expect(stomp1.controlMode).toBeDefined();
    expect(Object.keys(stomp1.steps).length).toBe(6);
    expect(Object.keys(stomp1.led).length).toBe(6);
    for (const step of Object.values(stomp1.steps)) {
      expect(step).toMatchObject({
        channel: expect.any(Number),
        msgType: expect.any(Number),
        data: expect.any(Array),
        active: expect.any(Boolean),
      });
    }
  });

  it("preserves Global-target fields opaquely", () => {
    const config = decodeSysex(loadFixture());
    expect(config.globalFields.length).toBe(37);
  });

  it("round-trips decode -> encode -> decode to an identical config", () => {
    const original = decodeSysex(loadFixture());
    const reencoded = encodeSysex(original);

    // The re-encoded bytes must themselves be well-formed Pacer SysEx (valid
    // framing + checksums), even though message grouping/order may differ
    // from the original capture.
    expect(() => splitSysexMessages(reencoded)).not.toThrow();

    const roundTripped = decodeSysex(reencoded);
    expect(roundTripped).toEqual(original);
  });
});
