import { describe, expect, it } from "vitest";
import { decodeSysex } from "../../protocol/decode";
import { encodeSysex } from "../../protocol/encode";
import { buildDemoConfig } from "../demoConfig";

describe("buildDemoConfig", () => {
  it("is well-formed: round-trips through the protocol's own encode/decode", () => {
    const config = buildDemoConfig();
    const roundTripped = decodeSysex(encodeSysex(config));
    expect(roundTripped).toEqual(config);
  });
});
