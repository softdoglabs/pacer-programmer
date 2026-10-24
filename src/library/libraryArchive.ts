// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { LibraryEntry } from "./configLibrary";

/*
 * Every saved configuration in one file, for a backup, for moving to another browser, or into an
 * installed copy of the app (which on Apple's platforms starts with storage of its own).
 *
 * A zip of plain .syx files, one per configuration, each exactly the bytes the library holds: any
 * SysEx tool can send one to a Pacer, and nothing in them is ours. Beside them, `library.json`
 * keeps what a .syx can't hold — each one's name in the list, where it came from, and when — so a
 * round trip comes back as it was. It's optional on the way in: a zip of .syx files made by hand
 * reads too, each named after its file.
 */

export const ARCHIVE_INDEX = "library.json";
const FORMAT = "pacer-programmer-library";

/** One configuration in an archive, as read back. */
export interface ArchiveItem {
  /** Its name in the list. */
  name: string;
  /** The .syx file it came from inside the zip. */
  file: string;
  bytes: Uint8Array;
  /** What the index says about it, when the zip has one. */
  details: Partial<Pick<LibraryEntry, "source" | "createdAt" | "modifiedAt" | "device">>;
}

type IndexRow = ArchiveItem["details"] & { file: string; name: string };

/** A name as a file name: what file systems refuse becomes "_", and it's never empty. */
function fileNameFor(name: string): string {
  const safe = [...name]
    .map((c) => (c.charCodeAt(0) < 0x20 || '\\/:*?"<>|'.includes(c) ? "_" : c))
    .join("")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 100);
  return safe || "configuration";
}

/** Packs configurations into a zip: a .syx per configuration, and the index. */
export function packLibrary(items: { entry: LibraryEntry; bytes: Uint8Array }[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const rows: IndexRow[] = [];
  for (const { entry, bytes } of items) {
    // Names needn't be unique in the list; files in a zip must be.
    const base = fileNameFor(entry.name);
    let file = `${base}.syx`;
    for (let n = 2; file in files; n++) file = `${base} (${n}).syx`;
    files[file] = bytes;
    rows.push({
      file,
      name: entry.name,
      source: entry.source,
      createdAt: entry.createdAt,
      ...(entry.modifiedAt ? { modifiedAt: entry.modifiedAt } : {}),
      ...(entry.device ? { device: entry.device } : {}),
    });
  }
  files[ARCHIVE_INDEX] = strToU8(JSON.stringify({ format: FORMAT, version: 1, configurations: rows }, null, 2));
  return zipSync(files, { level: 6 });
}

export class ArchiveError extends Error {
  override name = "ArchiveError";
}

/**
 * Reads a zip back into configurations, in the index's order, then any .syx the index doesn't
 * name. Throws ArchiveError if it isn't a zip or holds no .syx at all. Whether each one is a Pacer
 * dump is left to the library, which checks on the way in.
 */
export function unpackLibrary(zip: Uint8Array): ArchiveItem[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip);
  } catch (err) {
    throw new ArchiveError(`That isn't a zip file (${err instanceof Error ? err.message : String(err)})`);
  }
  const isSyx = (path: string) => /\.syx$/i.test(path) && !path.split("/").some((part) => part.startsWith("."));
  const syx = Object.keys(files).filter(isSyx);
  if (syx.length === 0) throw new ArchiveError("That zip has no .syx files in it");

  const items: ArchiveItem[] = [];
  const named = new Set<string>();
  for (const row of readIndex(files)) {
    const bytes = files[row.file];
    if (!bytes || !isSyx(row.file) || named.has(row.file)) continue;
    named.add(row.file);
    const { file, name, ...details } = row;
    items.push({ name, file, bytes, details });
  }
  for (const file of syx.filter((f) => !named.has(f)).sort()) {
    const name = (file.split("/").pop() ?? file).replace(/\.syx$/i, "");
    items.push({ name, file, bytes: files[file]!, details: {} });
  }
  return items;
}

/** The index's rows, or none if it's missing or unreadable: the .syx files are what matter. */
function readIndex(files: Record<string, Uint8Array>): IndexRow[] {
  const raw = files[ARCHIVE_INDEX];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(strFromU8(raw)) as { format?: unknown; configurations?: unknown };
    if (parsed.format !== FORMAT || !Array.isArray(parsed.configurations)) return [];
    return parsed.configurations.filter(
      (row): row is IndexRow =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as IndexRow).file === "string" &&
        typeof (row as IndexRow).name === "string" &&
        (row as IndexRow).name.trim() !== "",
    );
  } catch {
    return [];
  }
}

/** The archive's file name for a download on `date`. */
export function archiveFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Pacer Programmer configurations ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.zip`;
}
