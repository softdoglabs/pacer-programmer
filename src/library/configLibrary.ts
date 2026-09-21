import { isUserPresetIndex } from "../pacer/protocol/constants";
import { decodeSysex } from "../pacer/protocol/decode";
import type { PacerConfig } from "../pacer/protocol/types";

/*
 * Saved configurations: snapshots pulled from a Pacer or imported from files, kept in the
 * browser. Each entry stores the raw SysEx bytes exactly as received. The dump is the canonical
 * format (see CLAUDE.md, "Persistence philosophy"), it decodes losslessly, and it's about 3x
 * smaller than the JSON mirror. That matters because localStorage allows roughly 5 MB per origin,
 * enough for ~25 full dumps.
 */

export type ConfigSource = { kind: "device"; portName: string } | { kind: "file"; fileName: string };

export interface LibraryEntry {
  id: string;
  name: string;
  source: ConfigSource;
  /** ISO timestamp of when it was pulled or imported. */
  createdAt: string;
  byteLength: number;
  /** User presets (A1-D6) present in the dump. */
  presetCount: number;
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
      return [];
    }
  }

  private writeIndex(entries: LibraryEntry[]) {
    this.storage.setItem(INDEX_KEY, JSON.stringify(entries));
  }

  /** Saves a snapshot. Throws if the bytes don't decode as a Pacer dump, or LibraryFullError if storage is full. */
  add(name: string, source: ConfigSource, bytes: Uint8Array): LibraryEntry {
    const config = decodeSysex(bytes); // validates before anything is stored
    if (Object.keys(config.presets).length === 0 && config.globalFields.length === 0) {
      throw new Error("That doesn't contain any Pacer configuration data");
    }
    const entry: LibraryEntry = {
      id: this.newId(),
      name,
      source,
      createdAt: this.now().toISOString(),
      byteLength: bytes.length,
      presetCount: Object.keys(config.presets).map(Number).filter(isUserPresetIndex).length,
    };
    try {
      this.storage.setItem(dataKey(entry.id), toBase64(bytes));
      this.writeIndex([entry, ...this.list()]);
    } catch (err) {
      this.storage.removeItem(dataKey(entry.id));
      throw isQuotaError(err) ? new LibraryFullError() : err;
    }
    return entry;
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
