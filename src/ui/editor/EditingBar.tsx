// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Input, Label, TextField } from "react-aria-components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { hasUnsavedEdits } from "../../store/editingSlice";
import { usePacerStore } from "../../store/pacerStore";
import { EditScopeControl } from "./EditScopeControl";
import { SendToPacer } from "./SendToPacer";

function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName));
}

/** The save form. Mounted each time the dialog opens, so the name starts from the current config. */
function SaveForm({ onDone }: { onDone: () => void }) {
  const configSource = usePacerStore((s) => s.configSource);
  const activeConfigId = usePacerStore((s) => s.activeConfigId);
  const saveAsNewSnapshot = usePacerStore((s) => s.saveAsNewSnapshot);
  const saveOverActive = usePacerStore((s) => s.saveOverActive);
  const [name, setName] = useState(() => `${configSource} (edited)`);

  return (
    <>
      <TextField value={name} onChange={setName} className="flex flex-col gap-1" autoFocus>
        <Label className="text-xs text-muted-foreground">Name</Label>
        <Input className="h-9 rounded-md border bg-card px-2 text-sm ring-focus outline-none" />
      </TextField>
      <p className="text-xs text-muted-foreground">
        Saving keeps a snapshot in this browser. Nothing is sent to the Pacer.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {activeConfigId !== undefined && (
          <Button
            variant="outline"
            title={`Replace the “${configSource}” snapshot with what's open now`}
            onPress={() => {
              saveOverActive();
              onDone();
            }}
          >
            Save over “{configSource}”
          </Button>
        )}
        <Button
          isDisabled={!name.trim()}
          title="Keep the current configuration as a new snapshot in this browser"
          onPress={() => {
            saveAsNewSnapshot(name);
            onDone();
          }}
        >
          Save as new snapshot
        </Button>
      </div>
    </>
  );
}

function SaveDialog({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <ModalDialog isOpen={isOpen} onOpenChange={onOpenChange} title="Save configuration">
      <SaveForm onDone={() => onOpenChange(false)} />
    </ModalDialog>
  );
}

/**
 * The controls for editing the one working configuration: undo/redo, save, and send to the Pacer.
 *
 * Program mode and the preset map both edit it — the map by rerouting a state's switches, which is
 * the same undo stack and the same unsaved configuration — so both carry these rather than the map
 * quietly changing presets with no way back.
 */
export function EditingBar() {
  const undo = usePacerStore((s) => s.undo);
  const redo = usePacerStore((s) => s.redo);
  const canUndo = usePacerStore((s) => s.editHistory.past.length > 0);
  const canRedo = usePacerStore((s) => s.editHistory.future.length > 0);
  const unsaved = usePacerStore(hasUnsavedEdits);
  const [saving, setSaving] = useState(false);

  // Undo/redo shortcuts, except while typing in a field (which has its own undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || isTextInput(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Icon-only, so each carries a tooltip naming it and its shortcut: bare arrow glyphs read as nothing. */}
      <Button
        size="icon"
        variant="ghost"
        isDisabled={!canUndo}
        onPress={undo}
        aria-label="Undo"
        title={canUndo ? "Undo (\u2318Z)" : "Undo (nothing to undo yet)"}
      >
        <Undo2 className="size-4" aria-hidden />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        isDisabled={!canRedo}
        onPress={redo}
        aria-label="Redo"
        title={canRedo ? "Redo (\u21e7\u2318Z)" : "Redo (nothing to redo yet)"}
      >
        <Redo2 className="size-4" aria-hidden />
      </Button>
      <EditScopeControl />
      {unsaved && <Badge variant="outline">● unsaved</Badge>}
      <Button
        size="sm"
        variant={unsaved ? "default" : "outline"}
        isDisabled={!unsaved}
        title={
          unsaved ? "Save these edits as a snapshot in this browser" : "Nothing to save: no edits since this was opened"
        }
        onPress={() => setSaving(true)}
      >
        Save…
      </Button>
      <SaveDialog isOpen={saving} onOpenChange={setSaving} />
      <SendToPacer />
    </div>
  );
}
