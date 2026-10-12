// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSysex } from "../../pacer/protocol/decode";
import { ConfigLibrary, LibraryFullError, MemoryStorage } from "../configLibrary";

const FIXTURE = new Uint8Array(readFileSync("fixtures/factory-presets.syx"));

function library(storage = new MemoryStorage()) {
  let n = 0;
  let t = Date.UTC(2026, 8, 21, 12, 0, 0);
  return new ConfigLibrary(
    storage,
    () => new Date((t += 60_000)),
    () => `id${++n}`,
  );
}

describe("ConfigLibrary", () => {
  it("saves a snapshot and loads back exactly the same bytes and config", () => {
    const lib = library();
    const entry = lib.add("Gig rig", { kind: "device", portName: "PACER" }, FIXTURE);
    expect(entry).toMatchObject({ id: "id1", name: "Gig rig", byteLength: FIXTURE.length, presetCount: 24 });
    expect([...lib.loadBytes("id1")]).toEqual([...FIXTURE]);
    expect(lib.load("id1")).toEqual(decodeSysex(FIXTURE));
  });

  it("lists newest first, and renames and removes entries", () => {
    const storage = new MemoryStorage();
    const lib = library(storage);
    lib.add("first", { kind: "file", fileName: "a.syx" }, FIXTURE);
    lib.add("second", { kind: "device", portName: "PACER" }, FIXTURE);
    expect(lib.list().map((e) => e.name)).toEqual(["second", "first"]);
    lib.rename("id1", "renamed");
    expect(lib.list().map((e) => e.name)).toEqual(["second", "renamed"]);
    lib.remove("id2");
    expect(lib.list().map((e) => e.id)).toEqual(["id1"]);
    expect(storage.getItem("pacer-programmer.library.v1.config.id2")).toBeNull();
  });

  it("persists across instances sharing the same storage", () => {
    const storage = new MemoryStorage();
    library(storage).add("kept", { kind: "file", fileName: "x.syx" }, FIXTURE);
    expect(new ConfigLibrary(storage).list().map((e) => e.name)).toEqual(["kept"]);
  });

  it("rejects bytes that aren't a Pacer dump, storing nothing", () => {
    const storage = new MemoryStorage();
    const lib = library(storage);
    expect(() => lib.add("junk", { kind: "file", fileName: "junk.syx" }, Uint8Array.from([1, 2, 3]))).toThrow(
      /doesn't contain any Pacer configuration/,
    );
    expect(lib.list()).toEqual([]);
  });

  it("reports a full library and leaves no partial data behind", () => {
    const storage = new MemoryStorage(300_000); // room for one dump, not two
    const lib = library(storage);
    lib.add("one", { kind: "file", fileName: "1.syx" }, FIXTURE);
    expect(() => lib.add("two", { kind: "file", fileName: "2.syx" }, FIXTURE)).toThrow(LibraryFullError);
    expect(lib.list().map((e) => e.name)).toEqual(["one"]);
    expect(storage.getItem("pacer-programmer.library.v1.config.id2")).toBeNull();
  });

  it("treats a corrupt index as empty instead of breaking", () => {
    const storage = new MemoryStorage();
    storage.setItem("pacer-programmer.library.v1.index", "{not json");
    expect(library(storage).list()).toEqual([]);
  });

  it("replaces a snapshot's bytes in place, keeping its name and source", () => {
    const lib = library();
    lib.add("rig", { kind: "file", fileName: "rig.syx" }, FIXTURE);
    const edited = new Uint8Array(FIXTURE); // same shape; content identity is what matters here
    const updated = lib.replace("id1", edited);
    expect(updated).toMatchObject({ id: "id1", name: "rig", source: { kind: "file", fileName: "rig.syx" } });
    expect(updated.modifiedAt).toBeDefined();
    expect(lib.list()).toHaveLength(1);
    expect(() => lib.replace("nope", edited)).toThrow(/no longer exists/);
    expect(() => lib.replace("id1", Uint8Array.from([1, 2]))).toThrow(/doesn't contain/);
  });
});
