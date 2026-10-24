// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { ConfigLibrary, LibraryFullError, type LibraryEntry, type KeyValueStorage } from "../library/configLibrary";
import { packLibrary, type ArchiveItem } from "../library/libraryArchive";
import { DumpError, findPacerPorts, pullFullDump, type PacerPorts } from "../midi/pacerDump";
import { queryDeviceIdentity, type IdentityResult } from "../midi/deviceIdentity";
import type { MidiConnection } from "../midi/webMidi";
import { loadFactoryDefaults } from "../pacer/factoryDefaults";
import { encodeSysex } from "../pacer/protocol/encode";
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
  /** Saves the working config as a new snapshot and switches to it. */
  saveAsNewSnapshot: (name: string) => void;
  /** Overwrites the open snapshot with the working config (not possible for the built-in factory defaults). */
  saveOverActive: () => void;
  savedConfigBytes: (id: string) => Uint8Array;
  selectPacerPorts: (ports: PacerPorts) => void;
  /** Re-detects the Pacer's ports after MIDI ports change, keeping still-valid user choices. */
  refreshPacerPorts: () => void;
  /** Reopens the configuration that was open last visit, if it still exists. */
  restoreLastOpened: () => void;
  /** Every saved configuration as one zip (libraryArchive.ts). The built-in factory defaults aren't in it. */
  libraryArchive: () => Uint8Array;
  /**
   * Brings configurations from an archive into the library: each choice is added, or written over
   * the saved configuration `replaceId` names. Items not chosen are left out. Replacing the open
   * one reopens it, so what's on screen is what's saved.
   */
  importArchive: (choices: ArchiveChoice[]) => ArchiveImportResult;
}

export interface ArchiveChoice {
  item: ArchiveItem;
  /** Write over this saved configuration instead of adding a new one. */
  replaceId?: string;
}

export interface ArchiveImportResult {
  added: number;
  replaced: number;
  /** What couldn't be brought in, and why. Storage running out stops the rest, which are listed too. */
  failed: { name: string; reason: string }[];
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

/** While presets are being written (and committed), nothing else may be sent to the Pacer (see pacerWrite.ts). */
export function isSendingToPacer(s: Pick<PacerStore, "send">): boolean {
  return s.send.status === "sending" || s.send.status === "verifying";
}

const WAIT_FOR_SEND = "Wait for the send to the Pacer to finish.";

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

  /**
   * Runs a library action, reporting a failure where the user is looking instead of throwing out
   * of a press handler, where nothing catches it and nothing is said. Storage throws for real:
   * the browser's quota is about 5 MB and a dump is a quarter of a megabyte.
   */
  function reportFailure(what: string, action: () => void) {
    try {
      action();
    } catch (err) {
      refreshEntries({ error: `Couldn't ${what}: ${errorMessage(err)}` });
    }
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

  /**
   * Asks the Pacer who it is as soon as both its ports are known — on connect, on a re-plug, or
   * when they're chosen by hand. It's a read-only Device Inquiry, so there's nothing to confirm,
   * and it saves making the firmware a thing you have to remember to go and ask for. Skipped while
   * the device is busy: a dump request too soon after a write corrupts the preset (see
   * pacerWrite.ts), and a retry comes free with the next port change.
   */
  function identifyWhenReachable() {
    const { pacerPorts, deviceInfo, pull } = get();
    if (!pacerPorts.inputId || !pacerPorts.outputId) return;
    if (deviceInfo.kind === "querying" || isSendingToPacer(get()) || pull.status === "pulling") return;
    void get().checkFirmware();
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
      if (isSendingToPacer(get())) {
        set({ deviceInfo: { kind: "error", message: WAIT_FOR_SEND } });
        return;
      }
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
      if (isSendingToPacer(get())) {
        set({ pull: { status: "error", received: 0, expected: EXPECTED_FULL_DUMP_MESSAGES, error: WAIT_FOR_SEND } });
        return;
      }
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
      reportFailure("rename that configuration", () => {
        library.rename(id, trimmed);
        refreshEntries();
        if (get().activeConfigId === id) set({ configSource: trimmed });
      });
    },

    deleteSavedConfig: (id) => {
      reportFailure("delete that configuration", () => {
        library.remove(id);
        refreshEntries();
        if (get().activeConfigId === id) get().openFactoryDefaults();
      });
    },

    savedConfigBytes: (id) => library.loadBytes(id),

    saveAsNewSnapshot: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const { board, configSource } = get();
      try {
        const entry = library.add(trimmed, { kind: "edit", basedOn: configSource }, encodeSysex(board.config));
        refreshEntries();
        set({ activeConfigId: entry.id, configSource: trimmed, savedConfig: board.config });
        rememberActive(entry.id);
      } catch (err) {
        refreshEntries({
          error: err instanceof LibraryFullError ? err.message : `Couldn't save: ${errorMessage(err)}`,
        });
      }
    },

    saveOverActive: () => {
      const { board, activeConfigId } = get();
      if (activeConfigId === undefined) {
        refreshEntries({ error: "The factory defaults are read-only; save as a new snapshot instead." });
        return;
      }
      try {
        library.replace(activeConfigId, encodeSysex(board.config));
        refreshEntries();
        set({ savedConfig: board.config });
      } catch (err) {
        refreshEntries({
          error: err instanceof LibraryFullError ? err.message : `Couldn't save: ${errorMessage(err)}`,
        });
      }
    },

    libraryArchive: () => packLibrary(library.list().map((entry) => ({ entry, bytes: library.loadBytes(entry.id) }))),

    importArchive: (choices) => {
      const result: ArchiveImportResult = { added: 0, replaced: 0, failed: [] };
      const activeId = get().activeConfigId;
      let reopen = false;
      for (const [n, { item, replaceId }] of choices.entries()) {
        try {
          if (replaceId !== undefined) {
            library.replace(replaceId, item.bytes);
            result.replaced++;
            if (replaceId === activeId) reopen = true;
          } else {
            const { source, createdAt, modifiedAt, device } = item.details;
            library.add(item.name, source ?? { kind: "file", fileName: item.file }, item.bytes, {
              ...(createdAt ? { createdAt } : {}),
              ...(modifiedAt ? { modifiedAt } : {}),
              ...(device ? { device } : {}),
            });
            result.added++;
          }
        } catch (err) {
          if (err instanceof LibraryFullError) {
            // Nothing more will fit: say so for this one and every one after it.
            result.failed.push(...choices.slice(n).map(({ item: rest }) => ({ name: rest.name, reason: err.message })));
            break;
          }
          result.failed.push({ name: item.name, reason: errorMessage(err) });
        }
      }
      refreshEntries();
      if (reopen && activeId) get().openSavedConfig(activeId);
      return result;
    },

    selectPacerPorts: (ports) => {
      set((s) => ({ pacerPorts: { ...s.pacerPorts, ...ports } }));
      identifyWhenReachable();
    },

    refreshPacerPorts: () => {
      const { inputs, outputs } = get().midi;
      const { inputId, outputId } = get().pacerPorts;
      const detected = findPacerPorts(inputs, outputs);
      const next = {
        inputId: inputs.some((p) => p.id === inputId) ? inputId : detected.inputId,
        outputId: outputs.some((p) => p.id === outputId) ? outputId : detected.outputId,
      };
      // A Pacer that has gone away takes its firmware reading with it.
      const lost = !next.inputId || !next.outputId;
      set({ pacerPorts: next, ...(lost ? { deviceInfo: { kind: "unknown" as const } } : {}) });
      if (next.inputId !== inputId || next.outputId !== outputId) identifyWhenReachable();
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
