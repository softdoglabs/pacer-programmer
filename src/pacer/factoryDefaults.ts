import factoryPresetsDataUrl from "../../fixtures/factory-presets.syx?inline";
import { decodeSysex } from "./protocol/decode";
import type { PacerConfig } from "./protocol/types";

/**
 * The Pacer's factory-default configuration (`fixtures/factory-presets.syx`, all 24 presets plus
 * globals), inlined into the bundle as a data URL so it can be decoded synchronously at startup.
 * See `fixtures/README.md` for the dump's provenance and its open licensing question.
 */
export function loadFactoryDefaults(): PacerConfig {
  const base64 = factoryPresetsDataUrl.slice(factoryPresetsDataUrl.indexOf(",") + 1);
  return decodeSysex(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
}
