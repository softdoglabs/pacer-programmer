// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LibraryEntry } from "../../library/configLibrary";
import { usePacerStore } from "../../store/pacerStore";
import { describeSource } from "./describe";

function downloadBytes(fileName: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Downloads a configuration as a `.syx` file. Every row has one, the built-in factory defaults included. */
export function ExportButton({ fileName, bytes }: { fileName: string; bytes: () => Uint8Array }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      title="Download this configuration as a .syx file"
      onPress={() => downloadBytes(`${fileName}.syx`, bytes())}
    >
      Export .syx
    </Button>
  );
}

export const rowClass = (active: boolean) =>
  cn(
    "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border pr-2 transition-colors",
    active ? "border-primary bg-primary/10" : "hover:bg-accent/50",
  );

/**
 * The clickable part of a configuration row: selecting it opens that configuration in the
 * simulator. Opening never sends anything to the Pacer.
 */
export function OpenArea({
  name,
  detail,
  active,
  onOpen,
}: {
  name: string;
  detail: string;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="min-w-0 flex-1 cursor-pointer rounded-md px-3 py-2 text-left ring-focus outline-none"
      aria-current={active ? "true" : undefined}
      title={active ? "Open in the simulator" : "Open in the simulator (nothing is sent to the Pacer)"}
      onClick={onOpen}
    >
      <div className="truncate text-sm font-medium">{name}</div>
      <div className="truncate text-xs text-muted-foreground">{detail}</div>
    </button>
  );
}

/** Runs an action that replaces the working config, asking first if there are unsaved edits. */
/** Runs an action, or asks first when there are unsaved edits (see ConfigurationsPanel). */
export type Guard = (action: () => void) => void;

export function EntryRow({ entry, guard }: { entry: LibraryEntry; guard: Guard }) {
  const active = usePacerStore((s) => s.activeConfigId === entry.id);
  const openSavedConfig = usePacerStore((s) => s.openSavedConfig);
  const renameSavedConfig = usePacerStore((s) => s.renameSavedConfig);
  const deleteSavedConfig = usePacerStore((s) => s.deleteSavedConfig);
  const savedConfigBytes = usePacerStore((s) => s.savedConfigBytes);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // A delete confirmation expires, so a stray second click much later doesn't delete.
  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => setConfirmingDelete(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  const commitRename = () => {
    renameSavedConfig(entry.id, draft);
    setEditing(false);
  };

  return (
    <li className={rowClass(active)}>
      {editing ? (
        <div className="min-w-0 flex-1 px-3 py-2">
          <input
            autoFocus
            aria-label="Configuration name"
            className="w-full rounded border bg-background px-2 py-0.5 text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setDraft(entry.name);
                setEditing(false);
              }
            }}
          />
          <div className="truncate text-xs text-muted-foreground">{describeSource(entry)}</div>
        </div>
      ) : (
        <OpenArea
          name={entry.name}
          detail={describeSource(entry)}
          active={active}
          onOpen={() => guard(() => openSavedConfig(entry.id))}
        />
      )}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          title="Rename this snapshot"
          onPress={() => {
            setDraft(entry.name);
            setEditing(true);
          }}
        >
          Rename
        </Button>
        <ExportButton fileName={entry.name} bytes={() => savedConfigBytes(entry.id)} />
        <Button
          size="sm"
          variant={confirmingDelete ? "destructive" : "ghost"}
          title={
            confirmingDelete ? "Delete it for good — this can't be undone" : "Delete this snapshot from the browser"
          }
          onPress={() =>
            confirmingDelete
              ? active
                ? guard(() => deleteSavedConfig(entry.id)) // deleting the open one reopens the factory defaults
                : deleteSavedConfig(entry.id)
              : setConfirmingDelete(true)
          }
        >
          {confirmingDelete ? "Confirm delete" : "Delete"}
        </Button>
      </div>
    </li>
  );
}
