import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PACER_WRITE_SETTLE_MS, SendError, sendPaced } from "../pacerWrite";
import { MidiConnection } from "../webMidi";
import { FakeMidiAccess, FakeOutput } from "./fakeMidi";

const MESSAGES = [0x10, 0x11, 0x12].map((b) => Uint8Array.from([0xf0, 0x00, 0x01, 0x77, 0x7f, 0x01, b, 0xf7]));

function setup(sysex = true) {
  const output = new FakeOutput("out", "PACER");
  return { output, connection: new MidiConnection(new FakeMidiAccess([output], sysex)) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("sendPaced", () => {
  it("sends each message in order, pausing between them, and reports progress", async () => {
    const { output, connection } = setup();
    const progress: number[] = [];
    const done = sendPaced(connection, MESSAGES, { outputId: "out", onProgress: (p) => progress.push(p.sent) });

    expect(output.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(9);
    expect(output.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(output.sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(PACER_WRITE_SETTLE_MS);
    await done;

    expect(output.sent).toEqual(MESSAGES.map((m) => [...m]));
    expect(progress).toEqual([0, 1, 2, 3]);
  });

  it("finishes only after the Pacer has had time to commit the writes", async () => {
    const { connection } = setup();
    let finished = false;
    const done = sendPaced(connection, MESSAGES, { outputId: "out" }).then(() => (finished = true));
    await vi.advanceTimersByTimeAsync(20); // all three sent
    await vi.advanceTimersByTimeAsync(PACER_WRITE_SETTLE_MS - 1);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(finished).toBe(true);
  });

  it("stops when cancelled, reporting how many were sent", async () => {
    const { output, connection } = setup();
    const controller = new AbortController();
    const done = sendPaced(connection, MESSAGES, { outputId: "out", signal: controller.signal });
    controller.abort();
    let settled = false;
    const failure = expect(done.finally(() => (settled = true))).rejects.toMatchObject({ name: "SendError", sent: 1 });
    await vi.advanceTimersByTimeAsync(10);
    expect(settled).toBe(false); // what did go out still gets its settle time
    await vi.advanceTimersByTimeAsync(PACER_WRITE_SETTLE_MS);
    await failure;
    expect(output.sent).toHaveLength(1);
  });

  it("fails without sending when SysEx isn't permitted", async () => {
    const { output, connection } = setup(false);
    await expect(sendPaced(connection, MESSAGES, { outputId: "out" })).rejects.toBeInstanceOf(SendError);
    expect(output.sent).toHaveLength(0);
  });
});
