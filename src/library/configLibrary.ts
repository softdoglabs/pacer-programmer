// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { isUserPresetIndex } from "../pacer/protocol/constants";
import type { DeviceIdentity } from "../pacer/protocol/identity";
import { decodeSysex } from "../pacer/protocol/decode";
import type { PacerConfig } from "../pacer/protocol/types";

/*
 * Saved configurations: snapshots pulled from a Pacer or imported from files, kept in the
 * browser. Each entry stores the raw SysEx bytes exactly as received. The dump is the canonical
 * format (see CLAUDE.md, "Persistence philosophy"), it decodes losslessly, and it's about 3x
 * smaller than the JSON mirror. That matters because localStorage allows roughly 5 MB per origin,
 * enough for ~25 full dumps.
 */

export type ConfigSource =
  | { kind: "device"; portName: string }
  | { kind: "file"; fileName: string }
  /** Saved from the programming interface, starting from the named configuration. */
  | { kind: "edit"; basedOn: string };

export interface LibraryEntry {
  id: string;
  name: string;
  source: ConfigSource;
  /** ISO timestamp of when it was pulled, imported, or saved. */
  createdAt: string;
  /** ISO timestamp of the last "save over", if it has been overwritten since. */
  modifiedAt?: string;
  byteLength: number;
  /** User presets (A1-D6) present in the dump. */
  presetCount: number;
  /** What the Pacer reported to a MIDI Device Inquiry when this was pulled, if it answered. */
  device?: DeviceIdentity;
}

/** The subset of the Web Storage API the library needs (localStorage in the app; a Map in tests). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements KeyValueStorage {
  private readonly items = new Map<string, string>();
  constructor(private readonly quotaChars = Infinity) {}
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    const used = [...this.items].reduce((n, [k, v]) => n + (k === key ? 0 : v.length), 0);
    if (used + value.length > this.quotaChars) throw new DOMException("quota exceeded", "QuotaExceededError");
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

/** localStorage if usable (it can be missing or throw in private windows or with site data blocked). */
export function browserStorage(): KeyValueStorage | undefined {
  try {
    const storage = globalThis.localStorage;
    const probe = "pacer-programmer.probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return undefined;
  }
}

export class LibraryFullError extends Error {
  override name = "LibraryFullError";
  constructor() {
    super("Browser storage is full. Delete or export some saved configurations and try again.");
  }
}

const PREFIX = "pacer-programmer.library.v1.";
const INDEX_KEY = `${PREFIX}index`;
const dataKey = (id: string) => `${PREFIX}config.${id}`;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === "QuotaExceededError" || err.code === 22);
}

/** Validates that bytes are a Pacer dump and summarizes them. Throws if they aren't. */
function describeBytes(bytes: Uint8Array): Pick<LibraryEntry, "byteLength" | "presetCount"> {
  const config = decodeSysex(bytes);
  if (Object.keys(config.presets).length === 0 && config.globalFields.length === 0) {
    throw new Error("That doesn't contain any Pacer configuration data");
  }
  return {
    byteLength: bytes.length,
    presetCount: Object.keys(config.presets).map(Number).filter(isUserPresetIndex).length,
  };
}

export class ConfigLibrary {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  /** Newest first. A corrupt or missing index reads as empty rather than breaking the app. */
  list(): LibraryEntry[] {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(INDEX_KEY) ?? "[]");
      return Array.isArray(parsed) ? (parsed as LibraryEntry[]) : [];
    } catch {
      return []; // reading: show nothing rather than break the app
    }
  }

  /**
   * The index for a *write*, which can't treat an unreadable one as empty the way `list` does:
   * every snapshot it names is still in storage, and overwriting it would strand all of them —
   * unreachable and still consuming the quota. Absent is empty; unparseable is a failure.
   */
  private indexForWrite(): LibraryEntry[] {
    const raw = this.storage.getItem(INDEX_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw); // throws on damage, which is the point
    if (!Array.isArray(parsed)) throw new Error("The saved-configuration index is damaged");
    return parsed as LibraryEntry[];
  }

  private writeIndex(entries: LibraryEntry[]) {
    this.storage.setItem(INDEX_KEY, JSON.stringify(entries));
  }

  /**
   * Saves a snapshot. Throws if the bytes don't decode as a Pacer dump, or LibraryFullError if
   * storage is full. `details` can carry its dates when it's coming back from an archive.
   */
  add(
    name: string,
    source: ConfigSource,
    bytes: Uint8Array,
    details: Partial<Pick<LibraryEntry, "device" | "createdAt" | "modifiedAt">> = {},
  ): LibraryEntry {
    const entry: LibraryEntry = {
      id: this.newId(),
      name,
      source,
      createdAt: this.now().toISOString(),
      ...describeBytes(bytes), // validates before anything is stored
      ...details,
    };
    try {
      this.storage.setItem(dataKey(entry.id), toBase64(bytes));
      this.writeIndex([entry, ...this.indexForWrite()]);
    } catch (err) {
      this.storage.removeItem(dataKey(entry.id));
      throw isQuotaError(err) ? new LibraryFullError() : err;
    }
    return entry;
  }

  /** Overwrites a snapshot's bytes (keeping its name and source). Leaves it unchanged if storage is full. */
  replace(id: string, bytes: Uint8Array): LibraryEntry {
    const existing = this.list().find((e) => e.id === id);
    if (!existing) throw new Error("That saved configuration no longer exists");
    const updated: LibraryEntry = { ...existing, ...describeBytes(bytes), modifiedAt: this.now().toISOString() };
    const previous = this.storage.getItem(dataKey(id));
    try {
      this.storage.setItem(dataKey(id), toBase64(bytes));
      this.writeIndex(this.list().map((e) => (e.id === id ? updated : e)));
    } catch (err) {
      if (previous !== null) this.storage.setItem(dataKey(id), previous);
      throw isQuotaError(err) ? new LibraryFullError() : err;
    }
    return updated;
  }

  loadBytes(id: string): Uint8Array {
    const text = this.storage.getItem(dataKey(id));
    if (text === null) throw new Error("This saved configuration's data is missing from browser storage");
    return fromBase64(text);
  }

  load(id: string): PacerConfig {
    return decodeSysex(this.loadBytes(id));
  }

  rename(id: string, name: string): void {
    this.writeIndex(this.list().map((e) => (e.id === id ? { ...e, name } : e)));
  }

  remove(id: string): void {
    this.writeIndex(this.list().filter((e) => e.id !== id));
    this.storage.removeItem(dataKey(id));
  }
}
