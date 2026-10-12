// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { describe, expect, it, vi } from "vitest";
import { connectMidi, MidiConnection } from "../webMidi";
import { FakeMidiAccess, FakeOutput } from "./fakeMidi";

describe("connectMidi", () => {
  it("reports unsupported when there's no Web MIDI", async () => {
    expect(await connectMidi(undefined)).toEqual({ kind: "unsupported" });
  });

  it("asks for SysEx first", async () => {
    const requester = vi.fn(async () => new FakeMidiAccess([]));
    const result = await connectMidi(requester);
    expect(result.kind).toBe("connected");
    expect(requester).toHaveBeenCalledWith({ sysex: true });
  });

  it("falls back to plain MIDI when SysEx is refused", async () => {
    const requester = vi.fn(async ({ sysex }: { sysex: boolean }) => {
      if (sysex) throw new Error("SysEx denied");
      return new FakeMidiAccess([], false);
    });
    const result = await connectMidi(requester);
    expect(result.kind === "connected" && result.connection.sysexEnabled).toBe(false);
  });

  it("reports denied when MIDI access is refused entirely", async () => {
    const result = await connectMidi(async () => {
      throw new Error("MIDI denied");
    });
    expect(result).toEqual({ kind: "denied", message: "MIDI denied" });
  });
});

describe("MidiConnection", () => {
  it("lists connected outputs by name and sends bytes to the chosen one", () => {
    const a = new FakeOutput("a", "Zeta");
    const b = new FakeOutput("b", "Alpha");
    const gone = new FakeOutput("c", "Gone");
    gone.state = "disconnected";
    const connection = new MidiConnection(new FakeMidiAccess([a, b, gone]));
    expect(connection.outputs()).toEqual([
      { id: "b", name: "Alpha" },
      { id: "a", name: "Zeta" },
    ]);
    expect(connection.send("a", [0xc0, 5])).toEqual({ ok: true });
    expect(a.sent).toEqual([[0xc0, 5]]);
    expect(connection.send("c", [0xc0, 5]).ok).toBe(false);
  });

  it("refuses SysEx without the SysEx permission", () => {
    const port = new FakeOutput("a", "Port");
    const connection = new MidiConnection(new FakeMidiAccess([port], false));
    expect(connection.send("a", [0xf0, 0x7f, 0x7f, 0x06, 0x02, 0xf7])).toEqual({
      ok: false,
      reason: "SysEx permission not granted",
    });
    expect(port.sent).toEqual([]);
  });

  it("notifies when ports change, until unsubscribed", () => {
    const access = new FakeMidiAccess([]);
    const connection = new MidiConnection(access);
    const listener = vi.fn();
    const unsubscribe = connection.onPortsChanged(listener);
    access.changePorts([new FakeOutput("a", "New")]);
    unsubscribe();
    access.changePorts([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
