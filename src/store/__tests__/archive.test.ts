// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { MemoryStorage } from "../../library/configLibrary";
import { unpackLibrary, type ArchiveItem } from "../../library/libraryArchive";
import { renamePreset } from "../../pacer/editing";
import { encodeSysex } from "../../pacer/protocol/encode";
import { decodeSysex } from "../../pacer/protocol/decode";
import { createConfigurationsSlice } from "../configurationsSlice";
import { usePacerStore, type PacerStore } from "../pacerStore";

const FIXTURE = new Uint8Array(readFileSync("fixtures/factory-presets.syx"));
const store = () => usePacerStore.getState();
const named = (name: string) => store().library.entries.filter((e) => e.name === name);
/** The factory dump with A1 renamed, so two configurations can differ. */
const variant = (a1: string) => encodeSysex(renamePreset(decodeSysex(FIXTURE), 1, a1));
const item = (name: string, bytes: Uint8Array): ArchiveItem => ({ name, file: `${name}.syx`, bytes, details: {} });

beforeEach(() => {
  for (const e of store().library.entries) store().deleteSavedConfig(e.id);
  store().openFactoryDefaults();
});

describe("downloading the whole library", () => {
  it("holds every saved configuration, newest first, and leaves the factory defaults out", () => {
    store().importSyxFile("one.syx", variant("ONE"));
    store().importSyxFile("two.syx", variant("TWO"));
    const back = unpackLibrary(store().libraryArchive());
    expect(back.map((i) => i.name)).toEqual(["two", "one"]);
    expect(back[1]!.bytes).toEqual(variant("ONE"));
    expect(back[1]!.details.source).toEqual({ kind: "file", fileName: "one.syx" });
  });
});

describe("loading a zip into the library", () => {
  it("adds new ones, replaces a taken name only when asked, and leaves out what isn't chosen", () => {
    store().importSyxFile("gig.syx", variant("OLD"));
    store().importSyxFile("rehearsal.syx", variant("KEEP"));
    const gig = named("gig")[0]!;
    const rehearsal = named("rehearsal")[0]!;
    store().openFactoryDefaults();

    const result = store().importArchive([
      { item: item("gig", variant("NEW")), replaceId: gig.id },
      { item: item("studio", variant("STU")) },
      // "rehearsal" is in the zip but wasn't chosen: what's saved stays.
    ]);

    expect(result).toEqual({ added: 1, replaced: 1, failed: [] });
    expect(named("gig")).toHaveLength(1);
    expect(store().savedConfigBytes(gig.id)).toEqual(variant("NEW"));
    expect(store().savedConfigBytes(rehearsal.id)).toEqual(variant("KEEP"));
    expect(named("studio")).toHaveLength(1);
    expect(store().activeConfigId).toBeUndefined(); // loading adds to the list; it opens nothing
  });

  it("keeps an archived configuration's own dates and source", () => {
    const [back] = unpackLibrary(
      (() => {
        store().importSyxFile("dated.syx", FIXTURE);
        const zip = store().libraryArchive();
        store().deleteSavedConfig(named("dated")[0]!.id);
        return zip;
      })(),
    );
    const createdAt = back!.details.createdAt;
    store().importArchive([{ item: back! }]);
    expect(named("dated")[0]).toMatchObject({ createdAt, source: { kind: "file", fileName: "dated.syx" } });
  });

  it("reopens the open configuration when it's replaced, so what's on screen is what's saved", () => {
    store().importSyxFile("live.syx", variant("BEFOR"));
    const live = named("live")[0]!;
    expect(store().activeConfigId).toBe(live.id);

    store().importArchive([{ item: item("live", variant("AFTER")), replaceId: live.id }]);
    expect(store().activeConfigId).toBe(live.id);
    expect(store().board.config.presets[1]?.name?.trim()).toBe("AFTER");
  });

  it("reports one that can't be read, and carries on with the rest", () => {
    const result = store().importArchive([
      { item: item("broken", new Uint8Array([0xf0, 0x01, 0xf7])) },
      { item: item("fine", FIXTURE) },
    ]);
    expect(result.added).toBe(1);
    expect(result.failed.map((f) => f.name)).toEqual(["broken"]);
    expect(named("fine")).toHaveLength(1);
  });
});

describe("loading a zip into a library that runs out of room", () => {
  it("stops when storage is full, and lists everything it couldn't bring in", () => {
    // A library of its own, with room for about one dump (base64 is 4/3 of the bytes).
    const storage = new MemoryStorage(Math.ceil(FIXTURE.length * 1.5));
    const small = create<PacerStore>(
      (set, get) =>
        ({
          ...createConfigurationsSlice(set, get, { storage, persistent: true, midiConnection: () => undefined }),
          loadConfig: vi.fn(),
          send: { status: "idle" },
        }) as unknown as PacerStore,
    );

    const result = small.getState().importArchive(["a", "b", "c"].map((name) => ({ item: item(name, FIXTURE) })));
    expect(result.added).toBe(1);
    expect(result.failed.map((f) => f.name)).toEqual(["b", "c"]);
    expect(result.failed[0]!.reason).toMatch(/storage is full/i);
    expect(small.getState().library.entries.map((e) => e.name)).toEqual(["a"]);
  });
});
