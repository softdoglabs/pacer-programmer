import { decodeSysex } from "../pacer/protocol/decode";
import { activeUserPresetIndex } from "../pacer/protocol/globalSettings";
import { buildGlobalSettingsRequest, isPacerDataMessage } from "../pacer/protocol/requests";
import { Target } from "../pacer/protocol/constants";
import type { MidiConnection } from "./webMidi";

export type LoadedPreset =
  /** The Pacer is on user preset `index` (SysEx idx 1-24). */
  | { kind: "user"; index: number }
  /** On a Track/Transport preset, or the reply didn't say. */
  | { kind: "other" }
  | { kind: "unknown"; reason: string };

/**
 * Asks the Pacer which preset it has loaded, from its global settings (`buildGlobalSettingsRequest`).
 * The reply is a burst of Global `Set` messages; it's complete once the input has been quiet
 * for `quietMs`.
 */
export function queryLoadedPreset(
  connection: MidiConnection,
  {
    inputId,
    outputId,
    timeoutMs = 1000,
    quietMs = 150,
  }: { inputId: string; outputId: string; timeoutMs?: number; quietMs?: number },
): Promise<LoadedPreset> {
  return new Promise((resolve) => {
    const messages: number[][] = [];
    let timer: ReturnType<typeof setTimeout> | undefined = undefined; // set once the request is sent
    const done = (result: LoadedPreset) => {
      clearTimeout(timer);
      unsubscribe?.();
      resolve(result);
    };
    const complete = () => {
      try {
        const index = activeUserPresetIndex(decodeSysex(Uint8Array.from(messages.flat())));
        done(index === undefined ? { kind: "other" } : { kind: "user", index });
      } catch (err) {
        done({ kind: "unknown", reason: `Unreadable reply: ${err instanceof Error ? err.message : String(err)}` });
      }
    };
    const unsubscribe = connection.listen(inputId, (bytes) => {
      if (!isPacerDataMessage(bytes) || bytes[6] !== Target.Global) return;
      messages.push(Array.from(bytes));
      clearTimeout(timer);
      timer = setTimeout(complete, quietMs);
    });
    if (!unsubscribe) return done({ kind: "unknown", reason: "The Pacer's MIDI input port isn't connected" });
    const sent = connection.send(outputId, buildGlobalSettingsRequest());
    if (!sent.ok) return done({ kind: "unknown", reason: `Couldn't ask the Pacer: ${sent.reason}` });
    timer = setTimeout(() => done({ kind: "unknown", reason: "The Pacer didn't answer" }), timeoutMs);
  });
}
