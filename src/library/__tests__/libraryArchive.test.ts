// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { LibraryEntry } from "../configLibrary";
import { ARCHIVE_INDEX, ArchiveError, archiveFileName, packLibrary, unpackLibrary } from "../libraryArchive";

const FIXTURE = new Uint8Array(readFileSync("fixtures/factory-presets.syx"));

const entry = (name: string, extra: Partial<LibraryEntry> = {}): LibraryEntry => ({
  id: name,
  name,
  source: { kind: "file", fileName: `${name}.syx` },
  createdAt: "2026-10-01T12:00:00.000Z",
  byteLength: FIXTURE.length,
  presetCount: 24,
  ...extra,
});

describe("packing the library into a zip", () => {
  it("comes back as it went in: names, bytes, where each came from, and when", () => {
    const device = { manufacturerId: [0x00, 0x01, 0x77], family: 9319, model: 8273, version: [0x30, 0x31, 0x30, 0x31] };
    const items = [
      { entry: entry("Friday gig", { modifiedAt: "2026-10-02T08:00:00.000Z" }), bytes: FIXTURE },
      {
        entry: entry("Pacer 2026-10-03 09:00", { source: { kind: "device", portName: "PACER MIDI1" }, device }),
        bytes: FIXTURE.slice(0, 1000),
      },
    ] as { entry: LibraryEntry; bytes: Uint8Array }[];

    const back = unpackLibrary(packLibrary(items));
    expect(back.map((i) => i.name)).toEqual(["Friday gig", "Pacer 2026-10-03 09:00"]);
    expect(back[0]!.bytes).toEqual(FIXTURE);
    expect(back[1]!.bytes).toEqual(FIXTURE.slice(0, 1000));
    expect(back[0]!.details).toEqual({
      source: { kind: "file", fileName: "Friday gig.syx" },
      createdAt: "2026-10-01T12:00:00.000Z",
      modifiedAt: "2026-10-02T08:00:00.000Z",
    });
    expect(back[1]!.details.source).toEqual({ kind: "device", portName: "PACER MIDI1" });
    expect(back[1]!.details.device).toEqual(device);
  });

  it("gives every configuration a file of its own, even when names repeat or can't be file names", () => {
    const back = unpackLibrary(
      packLibrary([
        { entry: entry("Gig"), bytes: FIXTURE },
        { entry: entry("Gig"), bytes: FIXTURE },
        { entry: entry('A/B: "test"?'), bytes: FIXTURE },
        { entry: entry("..."), bytes: FIXTURE },
      ]),
    );
    expect(back.map((i) => i.file)).toEqual(["Gig.syx", "Gig (2).syx", "A_B_ _test__.syx", "configuration.syx"]);
    // The names in the list are kept as they were; only the files are changed.
    expect(back.map((i) => i.name)).toEqual(["Gig", "Gig", 'A/B: "test"?', "..."]);
  });
});

describe("reading a zip", () => {
  it("reads a zip of .syx files made by hand, naming each after its file", () => {
    const zip = zipSync({
      "gig rig.syx": FIXTURE,
      "backups/old.SYX": FIXTURE,
      "notes.txt": strToU8("hi"),
      "__MACOSX/._gig rig.syx": strToU8("resource fork"),
      ".hidden/x.syx": FIXTURE,
    });
    const back = unpackLibrary(zip);
    expect(back.map((i) => [i.name, i.file])).toEqual([
      ["old", "backups/old.SYX"],
      ["gig rig", "gig rig.syx"],
    ]);
    expect(back.every((i) => Object.keys(i.details).length === 0)).toBe(true);
  });

  it("falls back to the files when the index is damaged, and keeps any .syx the index leaves out", () => {
    const damaged = zipSync({ "a.syx": FIXTURE, [ARCHIVE_INDEX]: strToU8("{ not json") });
    expect(unpackLibrary(damaged).map((i) => i.name)).toEqual(["a"]);

    const partial = zipSync({
      "a.syx": FIXTURE,
      "b.syx": FIXTURE,
      [ARCHIVE_INDEX]: strToU8(
        JSON.stringify({
          format: "pacer-programmer-library",
          version: 1,
          configurations: [
            { file: "b.syx", name: "Bee" },
            { file: "missing.syx", name: "Gone" },
            { file: "a.syx", name: "  " },
          ],
        }),
      ),
    });
    expect(unpackLibrary(partial).map((i) => i.name)).toEqual(["Bee", "a"]);
  });

  it("says what's wrong with a file that isn't a zip, or holds no .syx", () => {
    expect(() => unpackLibrary(FIXTURE)).toThrow(ArchiveError);
    expect(() => unpackLibrary(zipSync({ "readme.txt": strToU8("hi") }))).toThrow("no .syx files");
  });

  it("names the download after the day", () => {
    expect(archiveFileName(new Date(2026, 9, 23))).toBe("Pacer Programmer configurations 2026-10-23.zip");
  });
});
