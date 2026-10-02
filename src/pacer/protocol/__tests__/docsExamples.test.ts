import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { splitSysexMessages } from "../decode";

/*
 * docs/reference/programming-the-pacer.md is what an AI is pointed at to read or write a dump, so
 * a wrong byte there becomes a wrong preset on somebody's device. Every complete Pacer message the
 * page shows has to be one: framed, addressed to the Pacer, and carrying a checksum that's right.
 */

const page = readFileSync("docs/reference/programming-the-pacer.md", "utf8");

function messagesOnThePage(): string[] {
  const flat = page.replace(/[ \t]+/g, " ");
  return [...flat.matchAll(/F0 00 01 77 7F(?: [0-9A-F]{2})+ F7/g)].map((m) => m[0]);
}

describe("the byte examples in Programming the Pacer", () => {
  it("has examples to check", () => {
    expect(messagesOnThePage().length).toBeGreaterThanOrEqual(8);
  });

  it("shows only real Pacer messages, every checksum right", () => {
    for (const text of messagesOnThePage()) {
      const bytes = Uint8Array.from(text.split(" ").map((b) => parseInt(b, 16)));
      // Throws on a wrong checksum or a message that isn't the Pacer's.
      expect(() => splitSysexMessages(bytes), text).not.toThrow();
    }
  });
});
