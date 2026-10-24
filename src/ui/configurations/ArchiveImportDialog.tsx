// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Tick } from "@/components/ui/tick";
import type { LibraryEntry } from "../../library/configLibrary";
import type { ArchiveItem } from "../../library/libraryArchive";
import { decodeSysex } from "../../pacer/protocol/decode";
import { hasUnsavedEdits } from "../../store/editingSlice";
import type { ArchiveChoice, ArchiveImportResult } from "../../store/configurationsSlice";
import { usePacerStore } from "../../store/pacerStore";
import type { Guard } from "./EntryRow";

/*
 * Bringing a zip of configurations (libraryArchive.ts) into the saved list. It adds to the list
 * rather than replacing it, so the only question is what to do where a name is already taken: each
 * of those has its own tick, unticked, which keeps the saved one and leaves the zip's out. Ticked,
 * the zip's is written over it. One that's identical to what's saved asks nothing.
 */

export interface ArchiveChoiceFile {
  fileName: string;
  items: ArchiveItem[];
}

type Row =
  | { kind: "new"; item: ArchiveItem }
  | { kind: "clash"; item: ArchiveItem; existing: LibraryEntry }
  | { kind: "identical"; item: ArchiveItem; existing: LibraryEntry }
  | { kind: "unreadable"; item: ArchiveItem; reason: string };

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);

/** Each item against the saved list: new, a name that's taken (by the newest with it), identical, or unreadable. */
export function archiveRows(
  items: ArchiveItem[],
  entries: LibraryEntry[],
  bytesOf: (id: string) => Uint8Array | undefined,
): Row[] {
  return items.map((item): Row => {
    try {
      decodeSysex(item.bytes);
    } catch (err) {
      return { kind: "unreadable", item, reason: err instanceof Error ? err.message : String(err) };
    }
    const existing = entries.find((e) => sameName(e.name, item.name));
    if (!existing) return { kind: "new", item };
    const saved = bytesOf(existing.id);
    return saved && sameBytes(saved, item.bytes)
      ? { kind: "identical", item, existing }
      : { kind: "clash", item, existing };
  });
}

export function ArchiveImportDialog({
  choice,
  guard,
  onClose,
  onDone,
}: {
  choice: ArchiveChoiceFile | undefined;
  guard: Guard;
  onClose: () => void;
  onDone: (result: ArchiveImportResult) => void;
}) {
  return (
    <ModalDialog
      isOpen={choice !== undefined}
      onOpenChange={(open) => !open && onClose()}
      title={choice ? `Load configurations from ${choice.fileName}` : ""}
    >
      {choice && <Form key={choice.fileName} choice={choice} guard={guard} onClose={onClose} onDone={onDone} />}
    </ModalDialog>
  );
}

function Form({
  choice,
  guard,
  onClose,
  onDone,
}: {
  choice: ArchiveChoiceFile;
  guard: Guard;
  onClose: () => void;
  onDone: (result: ArchiveImportResult) => void;
}) {
  const entries = usePacerStore((s) => s.library.entries);
  const savedConfigBytes = usePacerStore((s) => s.savedConfigBytes);
  const importArchive = usePacerStore((s) => s.importArchive);
  const activeConfigId = usePacerStore((s) => s.activeConfigId);
  const unsaved = usePacerStore(hasUnsavedEdits);

  const rows = useMemo(
    () =>
      archiveRows(choice.items, entries, (id) => {
        try {
          return savedConfigBytes(id);
        } catch {
          return undefined;
        }
      }),
    // Worked out once, against the list as the dialog opened: the list changes when this is applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [choice],
  );
  // New ones start ticked to add; clashes start unticked, which keeps what's saved.
  const [ticked, setTicked] = useState<ReadonlySet<ArchiveItem>>(
    () => new Set(rows.filter((r) => r.kind === "new").map((r) => r.item)),
  );
  const toggle = (item: ArchiveItem, on: boolean) =>
    setTicked((t) => {
      const next = new Set(t);
      if (on) next.add(item);
      else next.delete(item);
      return next;
    });

  const clashes = rows.filter((r) => r.kind === "clash");
  const adding = rows.filter((r) => r.kind === "new" && ticked.has(r.item));
  const replacing = clashes.filter((r) => ticked.has(r.item));
  const choices: ArchiveChoice[] = [
    ...adding.map((r) => ({ item: r.item })),
    ...replacing.map((r) => ({ item: r.item, replaceId: r.existing.id })),
  ];
  const replacesOpen = replacing.some((r) => r.existing.id === activeConfigId);

  const apply = () => {
    const run = () => onDone(importArchive(choices));
    // Replacing the open configuration reopens it, which drops edits that weren't saved.
    if (replacesOpen && unsaved) guard(run);
    else run();
  };

  const action = [adding.length ? `add ${adding.length}` : "", replacing.length ? `replace ${replacing.length}` : ""]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        {choice.fileName} holds {rows.length === 1 ? "1 configuration" : `${rows.length} configurations`}. They're added
        to your saved ones; nothing already saved changes unless you tick it below.
      </p>

      {clashes.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {clashes.length} names are already taken:
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setTicked((t) => new Set([...t, ...clashes.map((r) => r.item)]))}
          >
            Replace all of them
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setTicked((t) => new Set([...t].filter((i) => !clashes.some((r) => r.item === i))))}
          >
            Keep all the saved ones
          </Button>
        </div>
      )}

      <ul className="max-h-80 space-y-1.5 overflow-auto rounded-md border p-2" aria-label="Configurations in the zip">
        {rows.map((row) => (
          <li key={row.item.file}>
            <ArchiveRow row={row} ticked={ticked.has(row.item)} onTick={(on) => toggle(row.item, on)} />
          </li>
        ))}
      </ul>

      {replacesOpen && (
        <p className="text-xs text-warning">
          You're replacing the configuration that's open, so it's reopened with what's in the zip
          {unsaved ? ", and your unsaved edits to it are lost" : ""}.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onPress={onClose}>
          Cancel
        </Button>
        <Button isDisabled={choices.length === 0} onPress={apply}>
          {choices.length === 0 ? "Nothing to load" : action.charAt(0).toUpperCase() + action.slice(1)}
        </Button>
      </div>
    </div>
  );
}

function ArchiveRow({ row, ticked, onTick }: { row: Row; ticked: boolean; onTick: (on: boolean) => void }) {
  const name = <span className="font-medium">{row.item.name}</span>;
  switch (row.kind) {
    case "new":
      return (
        <Tick className="text-sm" isSelected={ticked} onChange={onTick}>
          <span className="flex flex-wrap items-baseline gap-x-2">
            {name}
            <span className="text-xs text-muted-foreground">new</span>
          </span>
        </Tick>
      );
    case "clash":
      return (
        <Tick className="text-sm" isSelected={ticked} onChange={onTick}>
          <span className="flex flex-wrap items-baseline gap-x-2">
            {name}
            <span className="text-xs text-warning">
              {ticked
                ? `replaces the saved “${row.existing.name}”`
                : `“${row.existing.name}” is already saved; tick to replace it`}
            </span>
          </span>
        </Tick>
      );
    case "identical":
      return (
        <div className="flex flex-wrap items-baseline gap-x-2 py-1 pl-7">
          {name}
          <span className="text-xs text-muted-foreground">already saved, and identical</span>
        </div>
      );
    case "unreadable":
      return (
        <div className="flex flex-wrap items-baseline gap-x-2 py-1 pl-7">
          {name}
          <span className="text-xs text-destructive">can't be read: {row.reason}</span>
        </div>
      );
  }
}
