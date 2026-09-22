import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeSysex } from "../../pacer/protocol/decode";
import { encodeSysexMessages } from "../../pacer/protocol/encode";
import { queryLoadedPreset } from "../pacerState";
import { MidiConnection } from "../webMidi";
import { FakeInput, FakeMidiAccess, FakeOutput } from "./fakeMidi";

const factory = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
const GLOBAL_REPLY = encodeSysexMessages({ presets: {}, globalFields: factory.globalFields });

function setup(reply: Uint8Array[] | "silent") {
  const input = new FakeInput("in", "PACER");
  const output = new FakeOutput("out", "PACER");
  output.onSend = (data) => {
    if (reply !== "silent" && data[5] === 0x02 && data[6] === 0x05)
      queueMicrotask(() => reply.forEach((m) => input.receive(m)));
  };
  return { output, connection: new MidiConnection(new FakeMidiAccess([output], true, [input])) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("queryLoadedPreset", () => {
  it("asks for the global settings and reads the loaded user preset", async () => {
    const { output, connection } = setup(GLOBAL_REPLY);
    const result = queryLoadedPreset(connection, { inputId: "in", outputId: "out" });
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ kind: "user", index: 1 });
    expect(output.sent).toEqual([[0xf0, 0x00, 0x01, 0x77, 0x7f, 0x02, 0x05, 0x00, 0x7f, 0x7a, 0xf7]]);
  });

  it("reports an unknown answer when the Pacer stays silent", async () => {
    const { connection } = setup("silent");
    const result = queryLoadedPreset(connection, { inputId: "in", outputId: "out" });
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ kind: "unknown" });
  });
});
