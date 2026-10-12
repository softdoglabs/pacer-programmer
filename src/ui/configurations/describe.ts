// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import type { LibraryEntry } from "../../library/configLibrary";
import { formatFirmwareVersion, isNektar, type DeviceIdentity } from "../../pacer/protocol/identity";

export function describeOrigin(source: LibraryEntry["source"]): string {
  switch (source.kind) {
    case "device":
      return `Pulled from ${source.portName}`;
    case "file":
      return `Imported ${source.fileName}`;
    case "edit":
      return `Edited from ${source.basedOn}`;
  }
}

export function describeSource(entry: LibraryEntry): string {
  const format = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const saved = entry.modifiedAt ? ` · saved ${format(entry.modifiedAt)}` : "";
  const firmware = entry.device ? ` · firmware ${formatFirmwareVersion(entry.device)}` : "";
  return `${describeOrigin(entry.source)} · ${format(entry.createdAt)}${saved} · ${entry.presetCount} presets${firmware}`;
}

export function describeIdentity(identity: DeviceIdentity): string {
  const maker = isNektar(identity)
    ? "Nektar"
    : `manufacturer ${identity.manufacturerId.map((b) => b.toString(16)).join(" ")}`;
  return `Firmware ${formatFirmwareVersion(identity)} (${maker}, family ${identity.family}, model ${identity.model})`;
}
