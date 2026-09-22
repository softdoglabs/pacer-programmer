import { pullFullDump } from "../midi/pacerDump";
import { SendError, sendPaced } from "../midi/pacerWrite";
import type { MidiConnection } from "../midi/webMidi";
import { mismatchedPresets } from "../pacer/editing";
import { decodeSysex } from "../pacer/protocol/decode";
import { encodePresetMessages } from "../pacer/protocol/encode";
import type { PacerConfig } from "../pacer/protocol/types";
import { isSendingToPacer } from "./configurationsSlice";
import type { PacerStore } from "./pacerStore";

/*
 * Sending the working configuration's presets to the Pacer, for trying edits on the hardware.
 * Only user presets (A1-D6) are written, each as Set messages to its own slot: never the global
 * settings, and never the "Current" working slot (idx 0), whose write semantics are unknown.
 * Writing is immediate and there's no undo on the device, so the UI confirms exactly which
 * presets get overwritten before calling `sendToPacer`. The send isn't finished until the Pacer
 * has had time to commit the writes (`sendPaced`), and until then nothing else goes to the
 * device: no read-back, pull, or firmware check.
 */

export type SendView =
  | { status: "idle" }
  | { status: "sending"; presets: number[]; sent: number; total: number }
  | { status: "verifying"; presets: number[]; received: number; expected: number }
  | { status: "done"; presets: number[]; verified: boolean }
  | { status: "error"; presets: number[]; error: string; mismatched?: number[] };

export interface SendSlice {
  send: SendView;
  /**
   * What the Pacer is believed to hold, for "changed presets": the configuration as opened,
   * updated with each preset successfully sent since. Part of the session (see `freshSession`).
   */
  sendBaseline: PacerConfig;
  /** Writes the given user presets of the working config to the Pacer; with `verify`, reads them back. */
  sendToPacer: (presetIndices: readonly number[], options?: { verify?: boolean }) => Promise<void>;
  cancelSend: () => void;
  dismissSendResult: () => void;
}

type Set = (partial: Partial<PacerStore> | ((s: PacerStore) => Partial<PacerStore>)) => void;
type Get = () => PacerStore;

const PROGRESS_EVERY = 25;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** `base` with the given presets taken from `sent`. */
function withPresets(base: PacerConfig, sent: PacerConfig, indices: readonly number[]): PacerConfig {
  const presets = { ...base.presets };
  for (const idx of indices) presets[idx] = sent.presets[idx];
  return { ...base, presets };
}

export function createSendSlice(
  set: Set,
  get: Get,
  deps: { midiConnection: () => MidiConnection | undefined },
): Omit<SendSlice, "sendBaseline"> {
  let abort: AbortController | undefined;

  const busy = () => isSendingToPacer(get()) || get().pull.status === "pulling" || get().deviceInfo.kind === "querying";

  return {
    send: { status: "idle" },

    sendToPacer: async (presetIndices, { verify = false } = {}) => {
      if (busy()) return;
      const presets = [...presetIndices].sort((a, b) => a - b);
      const connection = deps.midiConnection();
      const { inputId, outputId } = get().pacerPorts;
      if (!connection || !outputId || (verify && !inputId)) {
        set({ send: { status: "error", presets, error: "Connect MIDI and choose the Pacer's ports first." } });
        return;
      }
      if (presets.length === 0) return;

      // Capture the config now: editing or opening another configuration mid-send doesn't change what's sent.
      const { board, sessionId } = get();
      const config = board.config;
      const messages = encodePresetMessages(config, presets);
      abort = new AbortController();
      const signal = abort.signal;
      const stillSameSession = () => get().sessionId === sessionId;

      try {
        await sendPaced(connection, messages, {
          outputId,
          signal,
          onProgress: ({ sent, total }) => {
            if (sent % PROGRESS_EVERY === 0 || sent === total) {
              set({ send: { status: "sending", presets, sent, total } });
            }
          },
        });
        if (stillSameSession()) set((s) => ({ sendBaseline: withPresets(s.sendBaseline, config, presets) }));

        if (!verify || !inputId) {
          set({ send: { status: "done", presets, verified: false } });
          return;
        }
        set({ send: { status: "verifying", presets, received: 0, expected: 0 } });
        const bytes = await pullFullDump(connection, {
          inputId,
          outputId,
          signal,
          onProgress: ({ received, expected }) => {
            if (received % 50 === 0 || received >= expected) {
              set({ send: { status: "verifying", presets, received, expected } });
            }
          },
        });
        const mismatched = mismatchedPresets(config, decodeSysex(bytes), presets);
        set({
          send:
            mismatched.length === 0
              ? { status: "done", presets, verified: true }
              : {
                  status: "error",
                  presets,
                  mismatched,
                  error: "The Pacer's read-back doesn't match what was sent for some presets.",
                },
        });
      } catch (err) {
        const partial = err instanceof SendError && err.sent < messages.length;
        set({
          send: {
            status: "error",
            presets,
            error: partial
              ? `${errorMessage(err)}. Presets may be partly written; send them again to be sure.`
              : errorMessage(err),
          },
        });
      } finally {
        abort = undefined;
      }
    },

    cancelSend: () => abort?.abort(),

    dismissSendResult: () => {
      if (!busy()) set({ send: { status: "idle" } });
    },
  };
}
