import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { hasUnsavedEdits } from "../store/editingSlice";
import { isSendingToPacer } from "../store/configurationsSlice";
import { usePacerStore } from "../store/pacerStore";
import { PullControls } from "./configurations/DeviceControls";
import { EntryRow, OpenArea, rowClass, type Guard } from "./configurations/EntryRow";

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

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    guard(() => importSyxFile(file.name, bytes));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
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
          title="Open a .syx dump from a file as a new snapshot"
          onPress={() => fileInputRef.current?.click()}
        >
          Import .syx
        </Button>
        <input ref={fileInputRef} type="file" accept=".syx" className="hidden" onChange={handleFile} />
      </div>
      <PullControls />
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
        </li>
        {library.entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} guard={guard} />
        ))}
      </ul>
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
