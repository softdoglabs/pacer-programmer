import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXPECTED_FULL_DUMP_MESSAGES, buildFullDumpRequest, isPacerDataMessage } from "../requests";

function splitMessages(bytes: Uint8Array): Uint8Array[] {
  const messages: Uint8Array[] = [];
  let start = 0;
  bytes.forEach((b, i) => {
    if (b === 0xf7) {
      messages.push(bytes.subarray(start, i + 1));
      start = i + 1;
    }
  });
  return messages;
}

describe("full dump request", () => {
  it("is Get / Full Backup with a valid checksum (same bytes as the reference editor)", () => {
    expect([...buildFullDumpRequest()]).toEqual([0xf0, 0x00, 0x01, 0x77, 0x7f, 0x02, 0x7f, 0x7f, 0xf7]);
    const [, , , , , cmd, tgt, checksum] = buildFullDumpRequest();
    expect((cmd! + tgt! + checksum!) % 128).toBe(0);
  });

  it("expects exactly as many messages as the factory dump holds, all of them Pacer data messages", () => {
    const messages = splitMessages(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
    expect(messages).toHaveLength(EXPECTED_FULL_DUMP_MESSAGES);
    expect(messages.every(isPacerDataMessage)).toBe(true);
  });

  it("rejects the request itself, other manufacturers, and non-SysEx", () => {
    expect(isPacerDataMessage(buildFullDumpRequest())).toBe(false); // a Get, not a Set
    expect(isPacerDataMessage([0xf0, 0x7e, 0x7f, 0x06, 0x02, 0xf7])).toBe(false);
    expect(isPacerDataMessage([0xc0, 0x05])).toBe(false);
  });
});
