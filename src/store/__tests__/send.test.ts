import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeInput, FakeMidiAccess, FakeOutput } from "../../midi/__tests__/fakeMidi";
import { changedPresets, renamePreset } from "../../pacer/editing";
import { userPresetIndex } from "../../pacer/protocol/constants";
import { decodeSysex } from "../../pacer/protocol/decode";
import { encodeSysexMessages } from "../../pacer/protocol/encode";
import { usePacerStore } from "../pacerStore";

const FIXTURE = new Uint8Array(readFileSync("fixtures/factory-presets.syx"));
const store = () => usePacerStore.getState();
const A1 = userPresetIndex(0, 1);
const C1 = userPresetIndex(2, 1);

/** Observed commit delay: a dump request within ~200 ms of preset writes corrupts them (see pacerWrite.ts). */
const FIRMWARE_COMMIT_MS = 250;
const D6 = userPresetIndex(3, 6);

/**
 * A fake Pacer holding a configuration: Set messages it receives are applied on top (later
 * messages win when decoding), and a dump request is answered with everything it holds.
 *
 * It models the firmware behavior observed on hardware: writes are committed only after the
 * input has been quiet for a while, and a dump request that arrives before that drops the
 * pending writes and fills each preset being written with D6's contents. It answers the global
 * settings request, which says it's on A1 (the factory dump's Current block).
 */
async function connectFakePacer({ ignoresWrites = false, answersGlobalRequest = true } = {}) {
  const input = new FakeInput("pacer-in", "PACER");
  const output = new FakeOutput("pacer-out", "PACER");
  const held: number[][] = encodeSysexMessages(decodeSysex(FIXTURE)).map((m) => [...m]);
  const holds = () => decodeSysex(Uint8Array.from(held.flat()));
  let pending: number[][] = [];
  let commitTimer: ReturnType<typeof setTimeout> | undefined;
  output.onSend = (data) => {
    if (data[5] === 0x01 && !ignoresWrites) {
      pending.push(data);
      clearTimeout(commitTimer);
      commitTimer = setTimeout(() => {
        held.push(...pending);
        pending = [];
      }, FIRMWARE_COMMIT_MS);
    }
    if (data[5] === 0x02 && data[6] === 0x05) {
      if (answersGlobalRequest)
        queueMicrotask(() => held.filter((m) => m[6] === 0x05).forEach((m) => input.receive(m)));
      return;
    }
    if (data[5] === 0x02) {
      if (pending.length > 0) {
        clearTimeout(commitTimer);
        const d6 = holds().presets[D6]!;
        const written = [...new Set(pending.map((m) => m[7]!))];
        const clobbered = Object.fromEntries(written.map((idx) => [idx, d6]));
        held.push(...encodeSysexMessages({ presets: clobbered, globalFields: [] }).map((m) => [...m]));
        pending = [];
      }
      queueMicrotask(() => held.forEach((m) => input.receive(m)));
    }
  };
  await store().connectMidi(async () => new FakeMidiAccess([output], true, [input]));
  return { output, holds };
}

beforeEach(() => {
  vi.useFakeTimers();
  usePacerStore.setState({
    midi: { status: "disconnected", outputs: [], inputs: [], sysexEnabled: false },
    pacerPorts: {},
    pull: { status: "idle", received: 0, expected: 4762 },
    send: { status: "idle" },
  });
  store().openFactoryDefaults();
});
afterEach(() => vi.useRealTimers());

async function sendAndSettle(presets: number[], verify = false) {
  const done = store().sendToPacer(presets, { verify });
  await vi.runAllTimersAsync();
  await done;
}

describe("sending to the Pacer", () => {
  it("writes only the chosen presets, as Sets to their own slots, and nothing global", async () => {
    const { output, holds } = await connectFakePacer();
    store().applyEdit((c) => renamePreset(c, C1, "LOOPR"));
    await sendAndSettle([C1]);

    const writes = output.sent.filter((m) => m[5] === 0x01);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((m) => m[6] === 0x01 && m[7] === C1)).toBe(true);
    expect(holds().presets[C1]!.name).toBe("LOOPR");
    expect(store().send).toEqual({ status: "done", presets: [C1], verified: false, current: { kind: "notLoaded" } });
  });

  it("tracks what the Pacer holds, so 'changed presets' shrinks after a send", async () => {
    await connectFakePacer();
    store().applyEdit((c) => renamePreset(renamePreset(c, C1, "LOOPR"), A1, "HOME"));
    expect(changedPresets(store().sendBaseline, store().board.config)).toEqual([A1, C1]);
    await sendAndSettle([C1]);
    expect(changedPresets(store().sendBaseline, store().board.config)).toEqual([A1]);
  });

  it("verifies by reading back, only once the Pacer has committed the writes", async () => {
    const { holds } = await connectFakePacer();
    store().applyEdit((c) => renamePreset(c, A1, "HOME"));
    await sendAndSettle([A1], true);
    expect(store().send).toMatchObject({ status: "done", presets: [A1], verified: true });
    expect(holds().presets[A1]!.name).toBe("HOME ");
  });

  it("keeps pulls and firmware checks away from the Pacer while a send is committing", async () => {
    const { output } = await connectFakePacer();
    store().applyEdit((c) => renamePreset(c, A1, "HOME"));
    const done = store().sendToPacer([A1]);
    await vi.advanceTimersByTimeAsync(2000); // 189 messages at 10 ms: all written, still settling
    expect(store().send.status).toBe("sending");
    const before = output.sent.length;
    await store().pullFromPacer();
    await store().checkFirmware();
    expect(output.sent.length).toBe(before);
    await vi.runAllTimersAsync();
    await done;
  });

  it("also updates the Pacer's working copy when it has a sent preset loaded", async () => {
    const { holds } = await connectFakePacer();
    store().applyEdit((c) => renamePreset(c, A1, "HOME"));
    await sendAndSettle([A1], true);
    expect(store().send).toEqual({
      status: "done",
      presets: [A1],
      verified: true,
      current: { kind: "updated", index: A1 },
    });
    expect(holds().presets[0]).toEqual({ ...holds().presets[A1], index: 0 });
  });

  it("leaves the working copy alone when the loaded preset isn't sent", async () => {
    const { output, holds } = await connectFakePacer();
    const currentBefore = holds().presets[0];
    store().applyEdit((c) => renamePreset(c, C1, "LOOPR"));
    await sendAndSettle([C1], true);
    expect(store().send).toMatchObject({ status: "done", verified: true, current: { kind: "notLoaded" } });
    expect(holds().presets[0]).toEqual(currentBefore);
    expect(output.sent.some((m) => m[5] === 0x01 && m[7] === 0)).toBe(false);
  });

  it("still sends when the Pacer doesn't say which preset is loaded, and says so", async () => {
    const { holds } = await connectFakePacer({ answersGlobalRequest: false });
    store().applyEdit((c) => renamePreset(c, A1, "HOME"));
    await sendAndSettle([A1]);
    expect(store().send).toMatchObject({ status: "done", current: { kind: "unknown" } });
    expect(holds().presets[A1]!.name).toBe("HOME ");
  });

  it("reports presets whose read-back doesn't match", async () => {
    await connectFakePacer({ ignoresWrites: true });
    store().applyEdit((c) => renamePreset(c, C1, "LOOPR"));
    await sendAndSettle([C1], true);
    expect(store().send).toMatchObject({ status: "error", mismatched: [C1] });
  });

  it("refuses without MIDI, and a new configuration starts a fresh baseline", async () => {
    await store().sendToPacer([C1]);
    expect(store().send).toMatchObject({ status: "error", error: expect.stringMatching(/Connect MIDI/) });
    store().applyEdit((c) => renamePreset(c, C1, "LOOPR"));
    store().openFactoryDefaults();
    expect(changedPresets(store().sendBaseline, store().board.config)).toEqual([]);
  });

  it("can be cancelled mid-send", async () => {
    const { output } = await connectFakePacer();
    const done = store().sendToPacer([A1, C1]);
    await vi.advanceTimersByTimeAsync(300); // past the loaded-preset query, a few messages in
    store().cancelSend();
    await vi.runAllTimersAsync();
    await done;
    expect(store().send).toMatchObject({ status: "error", error: expect.stringMatching(/Cancelled.*partly written/) });
    expect(output.sent.filter((m) => m[5] === 0x01).length).toBeLessThan(50); // of 378
  });
});
