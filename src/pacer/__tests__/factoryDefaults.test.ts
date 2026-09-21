import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadFactoryDefaults } from "../factoryDefaults";
import { decodeSysex } from "../protocol/decode";

describe("loadFactoryDefaults", () => {
  it("decodes the bundled factory dump identically to the fixture file", () => {
    const fromFile = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
    expect(loadFactoryDefaults()).toEqual(fromFile);
  });
});
