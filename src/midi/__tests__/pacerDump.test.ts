// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFullDumpRequest } from "../../pacer/protocol/requests";
import { DumpError, findPacerPorts, pullFullDump } from "../pacerDump";
import { MidiConnection } from "../webMidi";
import { FakeInput, FakeMidiAccess, FakeOutput } from "./fakeMidi";

const FIXTURE = new Uint8Array(readFileSync("fixtures/factory-presets.syx"));

function splitMessages(bytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let start = 0;
  bytes.forEach((b, i) => {
    if (b === 0xf7) {
      out.push(bytes.subarray(start, i + 1));
      start = i + 1;
    }
  });
  return out;
}

/** A fake Pacer: answers a full-dump request by sending `reply` back on its input port. */
function fakePacer(reply: Uint8Array[] | "silent", sysex = true) {
  const input = new FakeInput("in", "PACER");
  const output = new FakeOutput("out", "PACER");
  output.onSend = (data) => {
    if (reply === "silent" || data[5] !== 0x02) return;
    queueMicrotask(() => reply.forEach((m) => input.receive(m)));
  };
  const connection = new MidiConnection(new FakeMidiAccess([output], sysex, [input]));
  return { connection, input, output };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("findPacerPorts", () => {
  it("matches ports named like the Pacer, case-insensitively", () => {
    expect(
      findPacerPorts(
        [
          { id: "i1", name: "IAC Bus 1" },
          { id: "i2", name: "PACER" },
        ],
        [{ id: "o1", name: "Nektar Pacer" }],
      ),
    ).toEqual({ inputId: "i2", outputId: "o1" });
    expect(findPacerPorts([], [])).toEqual({ inputId: undefined, outputId: undefined });
  });
});

describe("pullFullDump", () => {
  it("sends the full-dump request and returns exactly the bytes received", async () => {
    const { connection, output } = fakePacer(splitMessages(FIXTURE));
    const progress: number[] = [];
    const pulled = pullFullDump(connection, {
      inputId: "in",
      outputId: "out",
      onProgress: (p) => progress.push(p.received),
    });
    await vi.runAllTimersAsync();
    expect([...(await pulled)]).toEqual([...FIXTURE]);
    expect(output.sent).toEqual([[...buildFullDumpRequest()]]);
    expect(progress.at(-1)).toBe(4762);
  });

  it("completes on idle even when a different firmware sends fewer messages", async () => {
    const { connection } = fakePacer(splitMessages(FIXTURE).slice(0, 100));
    const pulled = pullFullDump(connection, { inputId: "in", outputId: "out" });
    await vi.runAllTimersAsync();
    expect((await pulled).length).toBeGreaterThan(0);
  });

  it("ignores non-Pacer traffic arriving on the same port", async () => {
    const pacerMessages = splitMessages(FIXTURE).slice(0, 3);
    const { connection, input } = fakePacer([pacerMessages[0]!]);
    const pulled = pullFullDump(connection, { inputId: "in", outputId: "out" });
    await Promise.resolve();
    input.receive([0xf8]); // MIDI clock
    input.receive([0xb0, 7, 100]);
    await vi.runAllTimersAsync();
    expect([...(await pulled)]).toEqual([...pacerMessages[0]!]);
  });

  it("fails clearly when the Pacer never answers, and stops listening", async () => {
    const { connection, input } = fakePacer("silent");
    const pulled = pullFullDump(connection, { inputId: "in", outputId: "out" });
    const outcome = expect(pulled).rejects.toThrow(/No reply from the Pacer/);
    await vi.advanceTimersByTimeAsync(5000);
    await outcome;
    expect(input.listenerCount).toBe(0);
  });

  it("fails when the ports aren't there, and when SysEx can't be sent", async () => {
    const { connection } = fakePacer("silent");
    await expect(pullFullDump(connection, { inputId: "nope", outputId: "out" })).rejects.toBeInstanceOf(DumpError);
    const noSysex = fakePacer("silent", false).connection;
    await expect(pullFullDump(noSysex, { inputId: "in", outputId: "out" })).rejects.toThrow(/SysEx permission/);
  });

  it("can be canceled", async () => {
    const { connection, input } = fakePacer("silent");
    const controller = new AbortController();
    const pulled = pullFullDump(connection, { inputId: "in", outputId: "out", signal: controller.signal });
    controller.abort();
    await expect(pulled).rejects.toThrow("Canceled");
    expect(input.listenerCount).toBe(0);
  });
});
