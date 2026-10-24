// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import { App } from "../../App";
import { unpackLibrary } from "../../library/libraryArchive";
import { changedPresets, renamePreset } from "../../pacer/editing";
import { userPresetIndex } from "../../pacer/protocol/constants";
import { encodePresetMessages, encodeSysex } from "../../pacer/protocol/encode";
import { usePacerStore } from "../../store/pacerStore";

const store = () => usePacerStore.getState();
const C1 = userPresetIndex(2, 1);
const D6 = userPresetIndex(3, 6);
const syx = (name: string, bytes: Uint8Array) => new File([bytes as BlobPart], name);
const join = (messages: Uint8Array[]) => Uint8Array.from(messages.flatMap((m) => [...m]));

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  act(() => usePacerStore.getState().setDeviceDrawerOpen(true));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the configurations list", () => {
  it("exports the factory defaults like any snapshot, byte for byte", async () => {
    // jsdom has no object URLs; catch what would have been downloaded.
    let downloaded: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      downloaded = blob;
      return "blob:factory";
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<App />);
    const list = screen.getByRole("list", { name: "Saved configurations" });
    const factory = within(list).getByText("Factory defaults").closest("li")!;
    fireEvent.click(within(factory).getByRole("button", { name: "Export" }));

    expect(downloaded).toBeDefined();
    const bytes = new Uint8Array(await downloaded!.arrayBuffer());
    expect(bytes).toEqual(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
  });
});

describe("bringing presets in from a file", () => {
  beforeEach(() => act(() => store().openFactoryDefaults()));

  it("brings a file of one preset into the open configuration instead of opening it", async () => {
    /*
     * What an AI asked to "write me C1" hands back: one preset, not a dump. Opened as a
     * configuration it would be 23 presets short, so Import brings it into the one that's open —
     * as an edit, which is what makes it undoable and shows C1 as changed.
     */
    act(() => store().setDeviceDrawerOpen(true));
    const before = store().board.config;
    const source = store().configSource;
    const file = join(encodePresetMessages(renamePreset(before, C1, "LOOPR"), [C1]));

    render(<App />);
    fireEvent.change(screen.getByLabelText("File to import"), { target: { files: [syx("looper.syx", file)] } });
    expect(await screen.findByText(/holds 1 of the Pacer's 24 presets/)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /C1 LOOPR/ })).toHaveProperty("checked", true);

    fireEvent.click(screen.getByRole("button", { name: "Merge 1 preset" }));
    expect(store().board.config.presets[C1]?.name?.trim()).toBe("LOOPR");
    expect(changedPresets(before, store().board.config)).toEqual([C1]);
    expect(store().configSource).toBe(source); // still the same configuration, with an edit
    expect(store().deviceDrawerOpen).toBe(false);

    act(() => store().undo());
    expect(store().board.config).toBe(before);
  });

  it("offers the presets of a whole dump, with the ones that differ checked", async () => {
    // A whole dump an AI changed two presets of: those two are checked without being named.
    act(() => store().setDeviceDrawerOpen(true));
    const before = store().board.config;
    const changed = renamePreset(renamePreset(before, C1, "LOOPR"), D6, "OTHER");

    render(<App />);
    fireEvent.change(screen.getByLabelText("File to merge presets from"), {
      target: { files: [syx("from-ai.syx", encodeSysex(changed))] },
    });
    expect(await screen.findByText(/Check the presets from from-ai.syx to merge/)).toBeTruthy();
    const checked = screen.getAllByRole<HTMLInputElement>("checkbox").filter((c) => c.checked);
    expect(checked).toHaveLength(2);

    // Leave D6 out: only C1 comes across.
    fireEvent.click(screen.getByRole("checkbox", { name: /D6 OTHER/ }));
    fireEvent.click(screen.getByRole("button", { name: "Merge 1 preset" }));
    expect(changedPresets(before, store().board.config)).toEqual([C1]);
  });

  it("lists what would change first, and points out a preset edited here since opening", async () => {
    /*
     * The file was exported before A2 was renamed here, so it still holds the old A2. Bringing it
     * in would undo that edit: it's checked like anything else that differs, and the row says why
     * you might not want it.
     */
    const A2 = userPresetIndex(0, 2);
    const exported = store().board.config;
    act(() => store().applyEdit((c) => renamePreset(c, A2, "MINE")));
    act(() => store().setDeviceDrawerOpen(true));

    render(<App />);
    fireEvent.change(screen.getByLabelText("File to merge presets from"), {
      target: { files: [syx("from-ai.syx", encodeSysex(renamePreset(exported, D6, "OTHER")))] },
    });
    await screen.findByText(/Check the presets from/);
    const rows = within(screen.getByRole("list", { name: "Presets to merge" })).getAllByRole("listitem");
    expect(rows.slice(0, 2).map((r) => r.textContent?.match(/[A-D][1-6]/)?.[0])).toEqual(["A2", "D6"]);
    expect(rows[0]!.textContent).toMatch(/you've edited this one since opening/);
    expect(rows[1]!.textContent).not.toMatch(/edited this one/);

    fireEvent.click(within(rows[0]!).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Merge 1 preset" }));
    expect(store().board.config.presets[A2]?.name?.trim()).toBe("MINE");
    expect(store().board.config.presets[D6]?.name?.trim()).toBe("OTHER");
  });

  it("says why when the file can't be read, or has no presets in it", async () => {
    act(() => store().setDeviceDrawerOpen(true));
    render(<App />);
    const input = screen.getByLabelText("File to merge presets from");

    // A real message with its checksum spoiled.
    const damaged = encodePresetMessages(store().board.config, [C1])[0]!.slice();
    damaged[damaged.length - 2] = (damaged[damaged.length - 2]! + 1) % 128;
    fireEvent.change(input, { target: { files: [syx("damaged.syx", damaged)] } });
    expect(await screen.findByText(/Couldn't read damaged.syx/)).toBeTruthy();

    fireEvent.change(input, { target: { files: [syx("notes.syx", new Uint8Array([1, 2, 3]))] } });
    expect(await screen.findByText(/notes.syx has no presets in it/)).toBeTruthy();
  });
});

describe("merging presets from a saved configuration", () => {
  it("offers a saved configuration's presets for merging into the open one, as an edit", async () => {
    /*
     * The same dialog as for a file, with a row of the list as the source: what differs is checked,
     * and what's merged is an unsaved edit of the open configuration, not a switch to the other one.
     */
    const factory = store().board.config;
    act(() => store().importSyxFile("looper.syx", encodeSysex(renamePreset(factory, C1, "LOOPR"))));
    const looperId = store().activeConfigId!;
    act(() => store().openFactoryDefaults());
    act(() => store().setDeviceDrawerOpen(true));

    render(<App />);
    const list = screen.getByRole("list", { name: "Saved configurations" });
    // The open row offers nothing to merge: it would be merging into itself.
    const factoryRow = within(list).getByText("Factory defaults").closest("li")!;
    expect(within(factoryRow).queryByRole("button", { name: "Pick presets from this…" })).toBeNull();
    const looperRow = within(list).getByText("looper").closest("li")!;
    fireEvent.click(within(looperRow).getByRole("button", { name: "Pick presets from this…" }));

    expect(await screen.findByText(/Check the presets from “looper” to merge/)).toBeTruthy();
    expect(screen.getAllByRole<HTMLInputElement>("checkbox").filter((c) => c.checked)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Merge 1 preset" }));

    expect(changedPresets(factory, store().board.config)).toEqual([C1]);
    expect(store().activeConfigId).toBeUndefined(); // still the factory defaults, with an edit
    act(() => store().deleteSavedConfig(looperId));
  });

  it("renames a row by its pencil, and deletes it by its trash can after a confirm", () => {
    act(() => store().importSyxFile("gig.syx", encodeSysex(store().board.config)));
    act(() => store().setDeviceDrawerOpen(true));
    render(<App />);
    const list = screen.getByRole("list", { name: "Saved configurations" });
    const row = () =>
      within(list)
        .getByText(/^(gig|Friday)$/)
        .closest("li")!;

    fireEvent.click(within(row()).getByRole("button", { name: /^Rename “gig”/ }));
    const input = within(list).getByRole("textbox", { name: "Configuration name" });
    fireEvent.change(input, { target: { value: "Friday" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // F2 on the name does the same, for the keyboard.
    fireEvent.keyDown(within(row()).getByRole("button", { name: "Friday" }), { key: "F2" });
    expect(within(list).getByRole("textbox", { name: "Configuration name" })).toBeTruthy();
    fireEvent.keyDown(within(list).getByRole("textbox", { name: "Configuration name" }), { key: "Escape" });

    fireEvent.click(within(row()).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(row()).getByRole("button", { name: "Confirm delete" }));
    expect(within(list).queryByText("Friday")).toBeNull();
  });
});

describe("downloading and loading every saved configuration as a zip", () => {
  const entriesNamed = (name: string) => store().library.entries.filter((e) => e.name === name);
  const variant = (a1: string) => encodeSysex(renamePreset(store().board.config, userPresetIndex(0, 1), a1));

  beforeEach(() => {
    act(() => {
      for (const e of store().library.entries) store().deleteSavedConfig(e.id);
      store().openFactoryDefaults();
      store().setDeviceDrawerOpen(true);
    });
  });

  it("downloads every saved configuration in one zip", async () => {
    let downloaded: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      downloaded = blob;
      return "blob:zip";
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    act(() => {
      store().importSyxFile("one.syx", variant("ONE"));
      store().importSyxFile("two.syx", variant("TWO"));
      store().setDeviceDrawerOpen(true);
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Download all (.zip)" }));
    expect(downloaded?.type).toBe("application/zip");
    const back = unpackLibrary(new Uint8Array(await downloaded!.arrayBuffer()));
    expect(back.map((i) => i.name).sort()).toEqual(["one", "two"]);
  });

  it("asks per taken name whether to replace it, adds the new ones, and skips what's identical", async () => {
    act(() => {
      store().importSyxFile("gig.syx", variant("OLD"));
      store().importSyxFile("same.syx", variant("SAME"));
      store().importSyxFile("keep.syx", variant("KEEP"));
      store().openFactoryDefaults();
      store().setDeviceDrawerOpen(true);
    });
    const gigId = entriesNamed("gig")[0]!.id;
    const keepId = entriesNamed("keep")[0]!.id;
    const zip = zipSync({
      "gig.syx": variant("NEW"),
      "same.syx": variant("SAME"),
      "keep.syx": variant("THEIR"),
      "studio.syx": variant("STU"),
      "broken.syx": new Uint8Array([0xf0, 0x01, 0xf7]),
    });

    render(<App />);
    fireEvent.change(screen.getByLabelText("Zip of configurations to load"), {
      target: { files: [syx("backup.zip", zip)] },
    });
    const list = await screen.findByRole("list", { name: "Configurations in the zip" });
    const row = (name: string) => within(list).getByText(name, { selector: "span.font-medium" }).closest("li")!;
    expect(row("studio").textContent).toContain("new");
    expect(row("same").textContent).toContain("already saved, and identical");
    expect(row("broken").textContent).toContain("can't be read");
    // A taken name starts unchecked, keeping what's saved.
    expect(within(row("gig")).getByRole("checkbox")).toHaveProperty("checked", false);
    expect(within(row("keep")).getByRole("checkbox")).toHaveProperty("checked", false);
    expect(within(row("studio")).getByRole("checkbox")).toHaveProperty("checked", true);

    fireEvent.click(within(row("gig")).getByRole("checkbox"));
    expect(row("gig").textContent).toContain("replaces the saved “gig”");
    fireEvent.click(screen.getByRole("button", { name: "Add 1, replace 1" }));

    expect(store().savedConfigBytes(gigId)).toEqual(variant("NEW"));
    expect(store().savedConfigBytes(keepId)).toEqual(variant("KEEP"));
    expect(entriesNamed("studio")).toHaveLength(1);
    expect(entriesNamed("same")).toHaveLength(1);
    expect(entriesNamed("broken")).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toBe("Added 1 and replaced 1.");
  });

  it("replaces or keeps every taken name at once", async () => {
    act(() => {
      store().importSyxFile("a.syx", variant("A1"));
      store().importSyxFile("b.syx", variant("B1"));
      store().setDeviceDrawerOpen(true);
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText("Zip of configurations to load"), {
      target: { files: [syx("backup.zip", zipSync({ "a.syx": variant("A2"), "b.syx": variant("B2") }))] },
    });
    await screen.findByRole("list", { name: "Configurations in the zip" });
    fireEvent.click(screen.getByRole("button", { name: "Replace all of them" }));
    expect(screen.getAllByRole<HTMLInputElement>("checkbox").every((c) => c.checked)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Keep all the saved ones" }));
    expect(screen.getByRole("button", { name: "Nothing to load" })).toHaveProperty("disabled", true);
  });

  it("says why a file isn't a zip of configurations", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Zip of configurations to load"), {
      target: { files: [syx("dump.zip", new Uint8Array([1, 2, 3]))] },
    });
    expect((await screen.findByRole("status")).textContent).toMatch(/Couldn't load dump.zip: That isn't a zip file/);
  });
});
