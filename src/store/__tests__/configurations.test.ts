import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeInput, FakeMidiAccess, FakeOutput } from "../../midi/__tests__/fakeMidi";
import { usePacerStore } from "../pacerStore";

const FIXTURE = new Uint8Array(readFileSync("fixtures/factory-presets.syx"));
const store = () => usePacerStore.getState();

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

/** Connects MIDI to a fake Pacer that answers dump requests with `reply`. */
async function connectFakePacer(reply: Uint8Array | "silent") {
  const input = new FakeInput("pacer-in", "PACER");
  const output = new FakeOutput("pacer-out", "PACER");
  output.onSend = (data) => {
    if (reply === "silent" || data[5] !== 0x02) return;
    queueMicrotask(() => splitMessages(reply).forEach((m) => input.receive(m)));
  };
  const other = new FakeOutput("synth", "Synth");
  await store().connectMidi(async () => new FakeMidiAccess([output, other], true, [input]));
  return { input, output };
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const e of store().library.entries) store().deleteSavedConfig(e.id);
  usePacerStore.setState({
    midi: { status: "disconnected", outputs: [], inputs: [], sysexEnabled: false },
    pacerPorts: {},
    pull: { status: "idle", received: 0, expected: 4762 },
  });
  store().openFactoryDefaults();
});
afterEach(() => vi.useRealTimers());

describe("configurations", () => {
  it("starts on the built-in factory defaults", () => {
    expect(store().activeConfigId).toBeUndefined();
    expect(store().configSource).toBe("Factory defaults");
  });

  it("imports a .syx file as a saved snapshot and opens it", () => {
    store().importSyxFile("my-rig.syx", FIXTURE);
    const [entry] = store().library.entries;
    expect(entry).toMatchObject({ name: "my-rig", source: { kind: "file", fileName: "my-rig.syx" }, presetCount: 24 });
    expect(store().activeConfigId).toBe(entry!.id);
    expect(store().configSource).toBe("my-rig");
    expect([...store().savedConfigBytes(entry!.id)]).toEqual([...FIXTURE]);
  });

  it("reports an import that isn't a Pacer dump, without changing what's open", () => {
    store().importSyxFile("junk.syx", Uint8Array.from([1, 2, 3]));
    expect(store().library.entries).toEqual([]);
    expect(store().library.error).toMatch(/Couldn't save junk/);
    expect(store().configSource).toBe("Factory defaults");
  });

  it("renames and deletes; deleting the open one falls back to factory defaults", () => {
    store().importSyxFile("a.syx", FIXTURE);
    const id = store().library.entries[0]!.id;
    store().renameSavedConfig(id, "  Gig rig  ");
    expect(store().library.entries[0]!.name).toBe("Gig rig");
    expect(store().configSource).toBe("Gig rig");
    store().deleteSavedConfig(id);
    expect(store().library.entries).toEqual([]);
    expect(store().configSource).toBe("Factory defaults");
  });

  it("keeps several snapshots and switches between them", () => {
    store().importSyxFile("one.syx", FIXTURE);
    store().importSyxFile("two.syx", FIXTURE);
    const [two, one] = store().library.entries;
    expect([two!.name, one!.name]).toEqual(["two", "one"]);
    store().openSavedConfig(one!.id);
    expect(store().configSource).toBe("one");
    store().openFactoryDefaults();
    expect(store().activeConfigId).toBeUndefined();
  });
});

describe("pulling from the Pacer", () => {
  it("auto-detects the Pacer's ports when MIDI connects", async () => {
    await connectFakePacer("silent");
    expect(store().pacerPorts).toEqual({ inputId: "pacer-in", outputId: "pacer-out" });
  });

  it("pulls a full dump, saves it as a device snapshot, and opens it", async () => {
    const { output } = await connectFakePacer(FIXTURE);
    const pulled = store().pullFromPacer();
    expect(store().pull.status).toBe("pulling");
    await vi.runAllTimersAsync();
    await pulled;
    expect(output.sent[0]).toEqual([0xf0, 0x00, 0x01, 0x77, 0x7f, 0x02, 0x7f, 0x7f, 0xf7]);
    const [entry] = store().library.entries;
    expect(entry).toMatchObject({ source: { kind: "device", portName: "PACER" }, presetCount: 24 });
    expect(entry!.name).toMatch(/^Pacer \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(store().activeConfigId).toBe(entry!.id);
    expect([...store().savedConfigBytes(entry!.id)]).toEqual([...FIXTURE]);
    expect(store().pull.status).toBe("idle");
  });

  it("switching configurations never sends anything to the Pacer", async () => {
    const { output } = await connectFakePacer("silent");
    store().selectMidiOutput("pacer-out"); // even with the Pacer as the simulator's MIDI out
    store().importSyxFile("a.syx", FIXTURE);
    const id = store().library.entries[0]!.id;
    store().openFactoryDefaults();
    store().openSavedConfig(id);
    expect(output.sent).toEqual([]);
  });

  it("reports a Pacer that doesn't answer", async () => {
    await connectFakePacer("silent");
    const pulled = store().pullFromPacer();
    await vi.advanceTimersByTimeAsync(5000);
    await pulled;
    expect(store().pull).toMatchObject({ status: "error", error: expect.stringMatching(/No reply from the Pacer/) });
    expect(store().library.entries).toEqual([]);
  });

  it("can be cancelled", async () => {
    await connectFakePacer("silent");
    const pulled = store().pullFromPacer();
    store().cancelPull();
    await pulled;
    expect(store().pull.status).toBe("idle");
  });

  it("asks for MIDI/ports when they aren't set up", async () => {
    await store().pullFromPacer();
    expect(store().pull).toMatchObject({ status: "error", error: expect.stringMatching(/Connect MIDI/) });
  });

  it("keeps a manual port choice across port changes, and re-detects when it disappears", async () => {
    const access = new FakeMidiAccess([new FakeOutput("pacer-out", "PACER"), new FakeOutput("synth", "Synth")], true, [
      new FakeInput("pacer-in", "PACER"),
    ]);
    await store().connectMidi(async () => access);
    store().selectPacerPorts({ outputId: "synth" });
    access.changePorts([new FakeOutput("pacer-out", "PACER"), new FakeOutput("synth", "Synth")]);
    expect(store().pacerPorts.outputId).toBe("synth");
    access.changePorts([new FakeOutput("pacer-out", "PACER")]);
    expect(store().pacerPorts.outputId).toBe("pacer-out");
  });
});
