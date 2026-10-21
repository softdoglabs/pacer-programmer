// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { hasUnsavedEdits } from "../store/editingSlice";
import { isSendingToPacer } from "../store/configurationsSlice";
import { usePacerStore } from "../store/pacerStore";
import { readPresetFile } from "../pacer/editing";
import { goBack } from "./appHistory";
import { PullControls } from "./configurations/DeviceControls";
import { ImportPresetsDialog, type PresetFileChoice } from "./configurations/ImportPresetsDialog";
import { factoryDefaultBytes } from "../pacer/factoryDefaults";
import { EntryRow, ExportButton, MergeButton, OpenArea, rowClass, type Guard } from "./configurations/EntryRow";

/** Saved configurations: pull from a Pacer or import files, then switch between snapshots. */
export function ConfigurationsPanel() {
  const library = usePacerStore((s) => s.library);
  const activeConfigId = usePacerStore((s) => s.activeConfigId);
  const pull = usePacerStore((s) => s.pull);
  const canPull = usePacerStore(
    (s) => s.midi.status === "connected" && s.pacerPorts.inputId !== undefined && s.pacerPorts.outputId !== undefined,
  );
  const importSyxFile = usePacerStore((s) => s.importSyxFile);
  const pullFromPacer = usePacerStore((s) => s.pullFromPacer);
  const sending = usePacerStore(isSendingToPacer);
  const openFactoryDefaults = usePacerStore((s) => s.openFactoryDefaults);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const unsaved = usePacerStore(hasUnsavedEdits);
  const configSource = usePacerStore((s) => s.configSource);
  const [pending, setPending] = useState<() => void>();
  const guard: Guard = (action) => (unsaved ? setPending(() => action) : action());
  const presetsInputRef = useRef<HTMLInputElement>(null);
  const setDrawerOpen = usePacerStore((s) => s.setDeviceDrawerOpen);
  const savedConfigBytes = usePacerStore((s) => s.savedConfigBytes);
  // A file whose presets are being brought into the open configuration, and why one couldn't be.
  const [presetFile, setPresetFile] = useState<PresetFileChoice>();
  const [presetFileError, setPresetFileError] = useState<string>();

  async function chosenFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setPresetFileError(undefined);
    if (!file) return undefined;
    return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = await chosenFile(event);
    if (!chosen) return;
    /*
     * A file that isn't a whole configuration can't be opened as one: the presets it leaves out
     * would simply not be there. It's brought into the open configuration instead, which is what
     * the Pacer would do with it. A file that can't be read at all goes the usual way, so the
     * refusal is reported where import failures always are.
     */
    try {
      const file = readPresetFile(chosen.bytes);
      if (!file.whole && file.presets.length > 0) return setPresetFile({ name: chosen.name, from: "file", file });
    } catch {
      // Reported by the import below.
    }
    guard(() => importSyxFile(chosen.name, chosen.bytes));
  }

  async function handlePresetsFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = await chosenFile(event);
    if (!chosen) return;
    try {
      const file = readPresetFile(chosen.bytes);
      if (file.presets.length === 0) return setPresetFileError(`${chosen.name} has no presets in it.`);
      setPresetFile({ name: chosen.name, from: "file", file });
    } catch (err) {
      setPresetFileError(`Couldn't read ${chosen.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** A saved configuration's presets, offered for merging like a file's. */
  function mergeFrom(name: string, bytes: Uint8Array) {
    setPresetFileError(undefined);
    try {
      setPresetFile({ name, from: "saved", file: readPresetFile(bytes) });
    } catch (err) {
      setPresetFileError(`Couldn't read “${name}”: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="space-y-3">
      {/* Two kinds of bringing in, so each is headed by where it puts things. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-full text-xs text-muted-foreground">New configuration</span>
        <Button
          size="sm"
          isDisabled={!canPull || pull.status === "pulling" || sending}
          title={
            canPull
              ? "Read everything on the Pacer into a new snapshot. Nothing on the device is changed."
              : "Connect MIDI and choose the Pacer's ports first"
          }
          onPress={() => guard(() => void pullFromPacer())}
        >
          {pull.status === "pulling" ? "Pulling…" : "Pull from Pacer"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          title="Open a .syx dump from a file as a new snapshot. A file with only some presets is merged into the open configuration instead."
          onPress={() => fileInputRef.current?.click()}
        >
          Import config…
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".syx"
          className="hidden"
          aria-label="File to import"
          onChange={handleFile}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-full truncate text-xs text-muted-foreground">
          Merge presets into the open configuration, “{configSource}”
        </span>
        <Button
          size="sm"
          variant="outline"
          title="Choose presets from a .syx file to merge into the open configuration, as edits you can undo"
          onPress={() => presetsInputRef.current?.click()}
        >
          Pick presets from a file…
        </Button>
        <input
          ref={presetsInputRef}
          type="file"
          accept=".syx"
          className="hidden"
          aria-label="File to merge presets from"
          onChange={handlePresetsFile}
        />
        <span className="text-xs text-muted-foreground">or from a configuration below.</span>
      </div>
      <PullControls />
      {presetFileError && <p className="text-xs text-destructive">{presetFileError}</p>}
      {library.error && <p className="text-xs text-destructive">{library.error}</p>}
      {!library.persistent && (
        <p className="text-xs text-warning">
          Browser storage isn't available, so saved configurations will be lost when this page reloads. Export any you
          want to keep.
        </p>
      )}
      <ul className="space-y-1.5" aria-label="Saved configurations">
        <li className={rowClass(activeConfigId === undefined)}>
          <OpenArea
            name="Factory defaults"
            detail="Built in · read-only"
            active={activeConfigId === undefined}
            onOpen={() => guard(openFactoryDefaults)}
          />
          <div className="flex gap-1">
            {activeConfigId !== undefined && (
              <MergeButton
                name="Factory defaults"
                onMerge={() => mergeFrom("Factory defaults", factoryDefaultBytes())}
              />
            )}
            <ExportButton fileName="Factory defaults" bytes={factoryDefaultBytes} />
          </div>
        </li>
        {library.entries.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            guard={guard}
            onMerge={() => mergeFrom(entry.name, savedConfigBytes(entry.id))}
          />
        ))}
      </ul>
      <ImportPresetsDialog
        choice={presetFile}
        onClose={() => setPresetFile(undefined)}
        onDone={() => {
          setPresetFile(undefined);
          // Back to the faceplate, where what was brought in can be seen.
          goBack(() => setDrawerOpen(false));
        }}
      />
      <ModalDialog
        isOpen={pending !== undefined}
        onOpenChange={(open) => !open && setPending(undefined)}
        title={`Discard unsaved changes to “${configSource}”?`}
      >
        <p className="text-sm text-muted-foreground">
          Your edits haven't been saved. Save them from the header first if you want to keep them.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" title="Go back, keeping your edits" onPress={() => setPending(undefined)}>
            Keep editing
          </Button>
          <Button
            variant="destructive"
            title="Throw the unsaved edits away and carry on"
            onPress={() => {
              pending?.();
              setPending(undefined);
            }}
          >
            Discard and continue
          </Button>
        </div>
      </ModalDialog>
    </div>
  );
}
