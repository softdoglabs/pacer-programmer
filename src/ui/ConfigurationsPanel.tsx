import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LibraryEntry } from "../library/configLibrary";
import { formatFirmwareVersion, isNektar, type DeviceIdentity } from "../pacer/protocol/identity";
import type { DeviceInfoView } from "../store/configurationsSlice";
import { usePacerStore } from "../store/pacerStore";
import { PortSelect } from "./PortSelect";

function describeSource(entry: LibraryEntry): string {
  const when = new Date(entry.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const from =
    entry.source.kind === "device" ? `Pulled from ${entry.source.portName}` : `Imported ${entry.source.fileName}`;
  const firmware = entry.device ? ` · firmware ${formatFirmwareVersion(entry.device)}` : "";
  return `${from} · ${when} · ${entry.presetCount} presets${firmware}`;
}

function describeIdentity(identity: DeviceIdentity): string {
  const maker = isNektar(identity)
    ? "Nektar"
    : `manufacturer ${identity.manufacturerId.map((b) => b.toString(16)).join(" ")}`;
  return `Firmware ${formatFirmwareVersion(identity)} (${maker}, family ${identity.family}, model ${identity.model})`;
}

function DeviceInfo({ info }: { info: DeviceInfoView }) {
  switch (info.kind) {
    case "unknown":
      return null;
    case "querying":
      return <span className="text-xs text-muted-foreground">Asking the Pacer…</span>;
    case "identified":
      return <span className="text-xs">{describeIdentity(info.identity)}</span>;
    case "noReply":
      return (
        <span className="text-xs text-muted-foreground">
          The Pacer didn't answer a MIDI Device Inquiry, so its firmware version isn't available.
        </span>
      );
    case "error":
      return <span className="text-xs text-destructive">{info.message}</span>;
  }
}

/** Offers bytes as a file download. */
function downloadBytes(fileName: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

const rowClass = (active: boolean) =>
  cn(
    "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border pr-2 transition-colors",
    active ? "border-primary bg-primary/10" : "hover:bg-accent/50",
  );

/**
 * The clickable part of a configuration row: selecting it opens that configuration in the
 * simulator. Opening never sends anything to the Pacer.
 */
function OpenArea({
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
      className="min-w-0 flex-1 cursor-pointer rounded-md px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      aria-current={active ? "true" : undefined}
      title={active ? "Open in the simulator" : "Open in the simulator (nothing is sent to the Pacer)"}
      onClick={onOpen}
    >
      <div className="truncate text-sm font-medium">{name}</div>
      <div className="truncate text-xs text-muted-foreground">{detail}</div>
    </button>
  );
}

function EntryRow({ entry }: { entry: LibraryEntry }) {
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
          onOpen={() => openSavedConfig(entry.id)}
        />
      )}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            setDraft(entry.name);
            setEditing(true);
          }}
        >
          Rename
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => downloadBytes(`${entry.name}.syx`, savedConfigBytes(entry.id))}
        >
          Export .syx
        </Button>
        <Button
          size="sm"
          variant={confirmingDelete ? "destructive" : "ghost"}
          onPress={() => (confirmingDelete ? deleteSavedConfig(entry.id) : setConfirmingDelete(true))}
        >
          {confirmingDelete ? "Confirm delete" : "Delete"}
        </Button>
      </div>
    </li>
  );
}

function PullControls() {
  const midi = usePacerStore((s) => s.midi);
  const pacerPorts = usePacerStore((s) => s.pacerPorts);
  const pull = usePacerStore((s) => s.pull);
  const selectPacerPorts = usePacerStore((s) => s.selectPacerPorts);
  const cancelPull = usePacerStore((s) => s.cancelPull);
  const deviceInfo = usePacerStore((s) => s.deviceInfo);
  const checkFirmware = usePacerStore((s) => s.checkFirmware);

  if (midi.status !== "connected") {
    return (
      <p className="text-xs text-muted-foreground">Connect MIDI (top right) to pull a configuration from a Pacer.</p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">Pacer ports:</span>
        <PortSelect
          label="in"
          ports={midi.inputs}
          value={pacerPorts.inputId}
          onChange={(inputId) => selectPacerPorts({ inputId })}
          noneLabel="—"
        />
        <PortSelect
          label="out"
          ports={midi.outputs}
          value={pacerPorts.outputId}
          onChange={(outputId) => selectPacerPorts({ outputId })}
          noneLabel="—"
        />
        {(!pacerPorts.inputId || !pacerPorts.outputId) && (
          <span className="text-xs text-warning">No Pacer found; connect it over USB or pick its ports.</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          isDisabled={!pacerPorts.inputId || !pacerPorts.outputId || deviceInfo.kind === "querying"}
          onPress={() => void checkFirmware()}
        >
          Check firmware
        </Button>
        <DeviceInfo info={deviceInfo} />
      </div>
      {!midi.sysexEnabled && (
        <p className="text-xs text-warning">Pulling needs the SysEx permission, which wasn't granted.</p>
      )}
      {pull.status === "pulling" && (
        <div className="flex items-center gap-3">
          <progress className="h-2 flex-1" max={pull.expected} value={pull.received} aria-label="Pull progress" />
          <span className="text-xs tabular-nums text-muted-foreground">
            {pull.received} / {pull.expected}
          </span>
          <Button size="sm" variant="ghost" onPress={cancelPull}>
            Cancel
          </Button>
        </div>
      )}
      {pull.status === "error" && <p className="text-xs text-destructive">{pull.error}</p>}
    </div>
  );
}

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
  const openFactoryDefaults = usePacerStore((s) => s.openFactoryDefaults);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) importSyxFile(file.name, new Uint8Array(await file.arrayBuffer()));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" isDisabled={!canPull || pull.status === "pulling"} onPress={() => void pullFromPacer()}>
          {pull.status === "pulling" ? "Pulling…" : "Pull from Pacer"}
        </Button>
        <Button size="sm" variant="outline" onPress={() => fileInputRef.current?.click()}>
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
            onOpen={openFactoryDefaults}
          />
        </li>
        {library.entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
        ))}
      </ul>
    </div>
  );
}
