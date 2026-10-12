// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryDeviceIdentity } from "../deviceIdentity";
import { MidiConnection } from "../webMidi";
import { FakeInput, FakeMidiAccess, FakeOutput } from "./fakeMidi";

const REPLY = [0xf0, 0x7e, 0x7f, 0x06, 0x02, 0x00, 0x01, 0x77, 0x05, 0x01, 0x03, 0x00, 0x01, 0x01, 0x01, 0x02, 0xf7];

function device(answers: boolean) {
  const input = new FakeInput("in", "PACER");
  const output = new FakeOutput("out", "PACER");
  output.onSend = (data) => {
    if (answers && data[1] === 0x7e) queueMicrotask(() => input.receive(REPLY));
  };
  return { connection: new MidiConnection(new FakeMidiAccess([output], true, [input])), input, output };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("queryDeviceIdentity", () => {
  it("sends a Device Inquiry and returns the parsed reply", async () => {
    const { connection, output, input } = device(true);
    const result = queryDeviceIdentity(connection, { inputId: "in", outputId: "out" });
    await vi.runAllTimersAsync();
    expect(await result).toEqual({
      kind: "identified",
      identity: { manufacturerId: [0, 1, 0x77], family: 0x85, model: 3, version: [1, 1, 1, 2] },
    });
    expect(output.sent).toEqual([[0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]]);
    expect(input.listenerCount).toBe(0);
  });

  it("reports no reply (not an error) when the device stays silent", async () => {
    const { connection, input } = device(false);
    const result = queryDeviceIdentity(connection, { inputId: "in", outputId: "out" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toEqual({ kind: "noReply" });
    expect(input.listenerCount).toBe(0);
  });

  it("reports a missing input port", async () => {
    const { connection } = device(true);
    expect(await queryDeviceIdentity(connection, { inputId: "nope", outputId: "out" })).toMatchObject({
      kind: "error",
    });
  });
});
