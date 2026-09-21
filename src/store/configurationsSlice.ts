import { ConfigLibrary, LibraryFullError, type LibraryEntry, type KeyValueStorage } from "../library/configLibrary";
import { DumpError, findPacerPorts, pullFullDump, type PacerPorts } from "../midi/pacerDump";
import { queryDeviceIdentity, type IdentityResult } from "../midi/deviceIdentity";
import type { MidiConnection } from "../midi/webMidi";
import { loadFactoryDefaults } from "../pacer/factoryDefaults";
import { EXPECTED_FULL_DUMP_MESSAGES } from "../pacer/protocol/requests";
import type { PacerStore } from "./pacerStore";

/*
 * Saved configurations: the library of snapshots (pulled from a Pacer or imported from files),
 * which one is open in the simulator, and pulling a dump from the device. Snapshots are
 * immutable for now; editing arrives with the programming interface.
 */

export interface LibraryView {
  entries: LibraryEntry[];
  /** False when browser storage is unavailable: entries then last only until the page reloads. */
  persistent: boolean;
  error?: string;
}

export interface PullView {
  status: "idle" | "pulling" | "error";
  received: number;
  expected: number;
  error?: string;
}

/** The Pacer's answer to a MIDI Device Inquiry (firmware version etc.). */
export type DeviceInfoView = { kind: "unknown" } | { kind: "querying" } | IdentityResult;

export interface ConfigurationsSlice {
  library: LibraryView;
  /** The saved configuration open in the simulator; undefined = the built-in factory defaults. */
  activeConfigId?: string;
  /** Ports used to talk to the Pacer (auto-detected by name when MIDI connects). */
  pacerPorts: PacerPorts;
  pull: PullView;
  deviceInfo: DeviceInfoView;
  /** Asks the Pacer for its identity (firmware version) via a MIDI Device Inquiry. */
  checkFirmware: () => Promise<void>;
  openFactoryDefaults: () => void;
  openSavedConfig: (id: string) => void;
  /** Saves an imported .syx as a new snapshot and opens it. */
  importSyxFile: (fileName: string, bytes: Uint8Array) => void;
  /** Pulls the full config from the Pacer, saves it as a new snapshot, and opens it. */
  pullFromPacer: () => Promise<void>;
  cancelPull: () => void;
  renameSavedConfig: (id: string, name: string) => void;
  deleteSavedConfig: (id: string) => void;
  savedConfigBytes: (id: string) => Uint8Array;
  selectPacerPorts: (ports: PacerPorts) => void;
  /** Re-detects the Pacer's ports after MIDI ports change, keeping still-valid user choices. */
  refreshPacerPorts: () => void;
  /** Reopens the configuration that was open last visit, if it still exists. */
  restoreLastOpened: () => void;
}

type Set = (partial: Partial<PacerStore> | ((s: PacerStore) => Partial<PacerStore>)) => void;
type Get = () => PacerStore;

const ACTIVE_KEY = "pacer-programmer.activeConfig";
const FACTORY_NAME = "Factory defaults";
const PROGRESS_EVERY = 50;

function snapshotName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Pacer ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createConfigurationsSlice(
  set: Set,
  get: Get,
  deps: {
    storage: KeyValueStorage;
    persistent: boolean;
    midiConnection: () => MidiConnection | undefined;
    now?: () => Date;
  },
): ConfigurationsSlice {
  const now = deps.now ?? (() => new Date());
  const library = new ConfigLibrary(deps.storage, now);
  let pullAbort: AbortController | undefined;

  const refreshEntries = (extra: Partial<LibraryView> = {}) =>
    set((s) => ({ library: { ...s.library, entries: library.list(), error: undefined, ...extra } }));

  const rememberActive = (id: string | undefined) => {
    try {
      if (id) deps.storage.setItem(ACTIVE_KEY, id);
      else deps.storage.removeItem(ACTIVE_KEY);
    } catch {
      // Remembering the open config is a convenience; never fail an action over it.
    }
  };

  function open(id: string) {
    const entry = library.list().find((e) => e.id === id);
    if (!entry) throw new Error("That saved configuration no longer exists");
    get().loadConfig(library.load(id), entry.name);
    set({ activeConfigId: id });
    rememberActive(id);
  }

  /** Saves bytes as a snapshot, then opens it. Reports failures in the library view instead of throwing. */
  function saveAndOpen(
    name: string,
    source: LibraryEntry["source"],
    bytes: Uint8Array,
    details: Pick<LibraryEntry, "device"> = {},
  ): boolean {
    try {
      const entry = library.add(name, source, bytes, details);
      refreshEntries();
      open(entry.id);
      return true;
    } catch (err) {
      refreshEntries({
        error: err instanceof LibraryFullError ? err.message : `Couldn't save ${name}: ${errorMessage(err)}`,
      });
      return false;
    }
  }

  return {
    library: { entries: library.list(), persistent: deps.persistent },
    activeConfigId: undefined,
    pacerPorts: {},
    pull: { status: "idle", received: 0, expected: EXPECTED_FULL_DUMP_MESSAGES },
    deviceInfo: { kind: "unknown" },

    checkFirmware: async () => {
      const connection = deps.midiConnection();
      const { inputId, outputId } = get().pacerPorts;
      if (!connection || !inputId || !outputId) {
        set({ deviceInfo: { kind: "error", message: "Connect MIDI and choose the Pacer's ports first." } });
        return;
      }
      set({ deviceInfo: { kind: "querying" } });
      set({ deviceInfo: await queryDeviceIdentity(connection, { inputId, outputId }) });
    },

    openFactoryDefaults: () => {
      get().loadConfig(loadFactoryDefaults(), FACTORY_NAME);
      set({ activeConfigId: undefined });
      rememberActive(undefined);
    },

    openSavedConfig: (id) => {
      try {
        open(id);
      } catch (err) {
        refreshEntries({ error: errorMessage(err) });
      }
    },

    importSyxFile: (fileName, bytes) => {
      saveAndOpen(fileName.replace(/\.syx$/i, ""), { kind: "file", fileName }, bytes);
    },

    pullFromPacer: async () => {
      const connection = deps.midiConnection();
      const { inputId, outputId } = get().pacerPorts;
      if (get().pull.status === "pulling") return;
      if (!connection || !inputId || !outputId) {
        set({
          pull: {
            status: "error",
            received: 0,
            expected: EXPECTED_FULL_DUMP_MESSAGES,
            error: "Connect MIDI and choose the Pacer's input and output ports first.",
          },
        });
        return;
      }
      pullAbort = new AbortController();
      set({ pull: { status: "pulling", received: 0, expected: EXPECTED_FULL_DUMP_MESSAGES } });
      // Record what firmware produced this dump, if the Pacer answers a Device Inquiry.
      const identity = await queryDeviceIdentity(connection, { inputId, outputId });
      set({ deviceInfo: identity });
      try {
        const bytes = await pullFullDump(connection, {
          inputId,
          outputId,
          signal: pullAbort.signal,
          onProgress: ({ received, expected }) => {
            if (received % PROGRESS_EVERY === 0 || received >= expected) {
              set({ pull: { status: "pulling", received, expected } });
            }
          },
        });
        const portName = get().midi.inputs.find((p) => p.id === inputId)?.name ?? "Pacer";
        const saved = saveAndOpen(
          snapshotName(now()),
          { kind: "device", portName },
          bytes,
          identity.kind === "identified" ? { device: identity.identity } : {},
        );
        set({
          pull: saved
            ? { status: "idle", received: 0, expected: EXPECTED_FULL_DUMP_MESSAGES }
            : {
                status: "error",
                received: 0,
                expected: EXPECTED_FULL_DUMP_MESSAGES,
                error: get().library.error ?? "Couldn't save the dump",
              },
        });
      } catch (err) {
        const cancelled = err instanceof DumpError && err.message === "Cancelled";
        set({
          pull: cancelled
            ? { status: "idle", received: 0, expected: EXPECTED_FULL_DUMP_MESSAGES }
            : { status: "error", received: 0, expected: EXPECTED_FULL_DUMP_MESSAGES, error: errorMessage(err) },
        });
      } finally {
        pullAbort = undefined;
      }
    },

    cancelPull: () => pullAbort?.abort(),

    renameSavedConfig: (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      library.rename(id, trimmed);
      refreshEntries();
      if (get().activeConfigId === id) set({ configSource: trimmed });
    },

    deleteSavedConfig: (id) => {
      library.remove(id);
      refreshEntries();
      if (get().activeConfigId === id) get().openFactoryDefaults();
    },

    savedConfigBytes: (id) => library.loadBytes(id),

    selectPacerPorts: (ports) => set((s) => ({ pacerPorts: { ...s.pacerPorts, ...ports } })),

    refreshPacerPorts: () => {
      const { inputs, outputs } = get().midi;
      const { inputId, outputId } = get().pacerPorts;
      const detected = findPacerPorts(inputs, outputs);
      set({
        pacerPorts: {
          inputId: inputs.some((p) => p.id === inputId) ? inputId : detected.inputId,
          outputId: outputs.some((p) => p.id === outputId) ? outputId : detected.outputId,
        },
      });
    },

    restoreLastOpened: () => {
      let id: string | null = null;
      try {
        id = deps.storage.getItem(ACTIVE_KEY);
      } catch {
        return;
      }
      if (id && library.list().some((e) => e.id === id)) get().openSavedConfig(id);
    },
  };
}
