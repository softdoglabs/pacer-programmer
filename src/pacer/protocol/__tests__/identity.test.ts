// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { describe, expect, it } from "vitest";
import { buildIdentityRequest, formatFirmwareVersion, isNektar, parseIdentityReply } from "../identity";

describe("MIDI Device Inquiry", () => {
  it("builds the standard broadcast Identity Request", () => {
    expect([...buildIdentityRequest()]).toEqual([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]);
  });

  it("parses a reply with an extended (3-byte) manufacturer ID", () => {
    const reply = [
      0xf0, 0x7e, 0x7f, 0x06, 0x02, 0x00, 0x01, 0x77, 0x05, 0x01, 0x03, 0x00, 0x01, 0x01, 0x01, 0x02, 0xf7,
    ];
    const identity = parseIdentityReply(reply)!;
    expect(identity).toEqual({ manufacturerId: [0x00, 0x01, 0x77], family: 0x85, model: 3, version: [1, 1, 1, 2] });
    expect(isNektar(identity)).toBe(true);
    expect(formatFirmwareVersion(identity)).toBe("1.1.1.2"); // non-printable bytes: dotted values
  });

  it("parses the reply a real Pacer sends, whose version is ASCII text", () => {
    // Captured from hardware: Nektar, family 9319, model 8273, version "0101".
    const reply = [
      0xf0, 0x7e, 0x7f, 0x06, 0x02, 0x00, 0x01, 0x77, 0x67, 0x48, 0x51, 0x40, 0x30, 0x31, 0x30, 0x31, 0xf7,
    ];
    const identity = parseIdentityReply(reply)!;
    expect(identity).toEqual({ manufacturerId: [0, 1, 0x77], family: 9319, model: 8273, version: [48, 49, 48, 49] });
    expect(formatFirmwareVersion(identity)).toBe("0101");
  });

  it("parses a 1-byte manufacturer ID, and rejects other messages", () => {
    expect(
      parseIdentityReply([0xf0, 0x7e, 0x10, 0x06, 0x02, 0x41, 0x01, 0x00, 0x02, 0x00, 0, 0, 0, 9, 0xf7]),
    ).toMatchObject({
      manufacturerId: [0x41],
      version: [0, 0, 0, 9],
    });
    expect(parseIdentityReply(buildIdentityRequest())).toBeUndefined();
    expect(parseIdentityReply([0xf0, 0x00, 0x01, 0x77, 0x7f, 0x01, 0xf7])).toBeUndefined();
    expect(parseIdentityReply([0xf0, 0x7e, 0x7f, 0x06, 0x02, 0x00, 0x01, 0x77, 0xf7])).toBeUndefined(); // truncated
  });
});
