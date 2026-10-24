// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { useEffect, useId, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LibraryEntry } from "../../library/configLibrary";
import { usePacerStore } from "../../store/pacerStore";
import { EditBadge } from "../panel/EditBadge";
import { describeSource } from "./describe";

export function downloadBytes(fileName: string, bytes: Uint8Array, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
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
      Export
    </Button>
  );
}

/**
 * Opens the merge dialog with this row's configuration as the source. Not offered on the open row:
 * merging a configuration into itself changes nothing.
 */
export function MergeButton({ name, onMerge }: { name: string; onMerge: () => void }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      title={`Choose presets from “${name}” to merge into the open configuration`}
      onPress={onMerge}
    >
      Pick presets from this…
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
 *
 * The button is the name, stretched over the whole area by a pseudo-element, so the rename pencil
 * beside the name can be a button of its own rather than one nested inside it. F2 renames too,
 * for the keyboard.
 */
export function OpenArea({
  name,
  detail,
  active,
  onOpen,
  onRename,
}: {
  name: string;
  detail: string;
  active: boolean;
  onOpen: () => void;
  onRename?: () => void;
}) {
  const detailId = useId();
  return (
    <div className="relative min-w-0 flex-1 rounded-md px-3 py-2 has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-ring">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className="min-w-0 cursor-pointer truncate text-left text-sm font-medium outline-none after:absolute after:inset-0"
          aria-current={active ? "true" : undefined}
          aria-describedby={detailId}
          aria-keyshortcuts={onRename ? "F2" : undefined}
          title={active ? "Open in the simulator" : "Open in the simulator (nothing is sent to the Pacer)"}
          onClick={onOpen}
          onKeyDown={(e) => {
            if (e.key === "F2" && onRename) {
              e.preventDefault();
              onRename();
            }
          }}
        >
          {name}
        </button>
        {onRename && (
          <EditBadge
            size="inline"
            className="z-10 shrink-0 text-sm"
            label={`Rename “${name}” (F2)`}
            onPress={onRename}
          />
        )}
      </div>
      <div id={detailId} className="truncate text-xs text-muted-foreground">
        {detail}
      </div>
    </div>
  );
}

/** Runs an action, or asks first when there are unsaved edits (see ConfigurationsPanel). */
export type Guard = (action: () => void) => void;

export function EntryRow({ entry, guard, onMerge }: { entry: LibraryEntry; guard: Guard; onMerge: () => void }) {
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
          onRename={() => {
            setDraft(entry.name);
            setEditing(true);
          }}
        />
      )}
      <div className="flex gap-1">
        {!active && <MergeButton name={entry.name} onMerge={onMerge} />}
        <ExportButton fileName={entry.name} bytes={() => savedConfigBytes(entry.id)} />
        {confirmingDelete ? (
          <Button
            size="sm"
            variant="destructive"
            title="Delete it for good — this can't be undone"
            onPress={() =>
              active
                ? guard(() => deleteSavedConfig(entry.id)) // deleting the open one reopens the factory defaults
                : deleteSavedConfig(entry.id)
            }
          >
            Confirm delete
          </Button>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Delete"
            title="Delete this snapshot from the browser"
            onPress={() => setConfirmingDelete(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </li>
  );
}
