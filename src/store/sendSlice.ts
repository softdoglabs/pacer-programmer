import { DumpError, pullFullDump } from "../midi/pacerDump";
import { queryLoadedPreset } from "../midi/pacerState";
import { SendError, sendPaced } from "../midi/pacerWrite";
import type { MidiConnection } from "../midi/webMidi";
import { mismatchedPresets } from "../pacer/editing";
import { decodeSysex } from "../pacer/protocol/decode";
import { CURRENT_PRESET_INDEX } from "../pacer/protocol/constants";
import { encodePresetAsCurrentMessages, encodePresetMessages } from "../pacer/protocol/encode";
import type { PacerConfig } from "../pacer/protocol/types";
import { isSendingToPacer } from "./configurationsSlice";
import type { PacerStore } from "./pacerStore";

/*
 * Sending the working configuration's presets to the Pacer, for trying edits on the hardware.
 * User presets (A1-D6) are written, each as Set messages to its own slot; global settings never
 * are. Writing a slot doesn't change the Pacer's "Current" working copy (idx 0) of the loaded
 * preset, which is what its switches run (observed on hardware). So the Pacer is first asked
 * which preset it has loaded, and if that's one being sent, the same contents go to Current too.
 * Writing is immediate and there's no undo on the device, so the UI confirms exactly which
 * presets get overwritten before calling `sendToPacer`. The send isn't finished until the Pacer
 * has had time to commit the writes (`sendPaced`), and until then nothing else goes to the
 * device: no read-back, pull, or firmware check.
 */

/** What happened to the Pacer's working copy of its loaded preset (see the module comment). */
export type CurrentUpdate =
  | { kind: "updated"; index: number }
  /** The Pacer has a preset loaded that isn't being sent (or a Track/Transport preset). */
  | { kind: "notLoaded" }
  | { kind: "unknown"; reason: string };

export type SendView =
  | { status: "idle" }
  | { status: "sending"; presets: number[]; sent: number; total: number }
  | { status: "verifying"; presets: number[]; received: number; expected: number }
  | { status: "done"; presets: number[]; verified: boolean; current?: CurrentUpdate }
  | { status: "error"; presets: number[]; error: string; mismatched?: number[]; current?: CurrentUpdate };

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

  /*
   * A send waits only for things that would collide with it on the wire. An identity query in
   * flight isn't one: its request has already gone out and it's only listening, and the hardware
   * rule runs the other way — nothing may reach the Pacer while *writes* are settling (see
   * pacerWrite.ts), which `checkFirmware` respects. Counting it here meant connecting and
   * immediately sending did nothing at all.
   */
  const busy = () => isSendingToPacer(get()) || get().pull.status === "pulling";

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
      abort = new AbortController();
      const signal = abort.signal;
      const stillSameSession = () => get().sessionId === sessionId;
      set({ send: { status: "sending", presets, sent: 0, total: 0 } });

      let current: CurrentUpdate = { kind: "unknown", reason: "The Pacer's MIDI input port isn't chosen" };
      if (inputId) {
        const loaded = await queryLoadedPreset(connection, { inputId, outputId });
        current =
          loaded.kind === "unknown"
            ? loaded
            : loaded.kind === "user" && presets.includes(loaded.index)
              ? { kind: "updated", index: loaded.index }
              : { kind: "notLoaded" };
      }
      // The slots first, then (if loaded) the working copy, all within one paced, settled send.
      const messages = [
        ...encodePresetMessages(config, presets),
        ...(current.kind === "updated" ? encodePresetAsCurrentMessages(config, current.index) : []),
      ];
      // What the read-back should show: the sent presets, and Current matching the loaded one.
      const expected =
        current.kind === "updated"
          ? {
              ...config,
              presets: {
                ...config.presets,
                [CURRENT_PRESET_INDEX]: { ...config.presets[current.index]!, index: CURRENT_PRESET_INDEX },
              },
            }
          : config;
      const checked = current.kind === "updated" ? [...presets, CURRENT_PRESET_INDEX] : presets;

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
          set({ send: { status: "done", presets, verified: false, current } });
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
        const mismatched = mismatchedPresets(expected, decodeSysex(bytes), checked);
        set({
          send:
            mismatched.length === 0
              ? { status: "done", presets, verified: true, current }
              : {
                  status: "error",
                  presets,
                  mismatched,
                  current,
                  error: "The Pacer's read-back doesn't match what was sent for some presets.",
                },
        });
      } catch (err) {
        /*
         * Cancelling the read-back isn't a failed send. By then the writes have landed and the
         * baseline has moved, so reporting an error invites sending again what already arrived.
         */
        if (err instanceof DumpError && err.message === "Cancelled") {
          set({ send: { status: "done", presets, verified: false, current } });
          return;
        }
        const partial = err instanceof SendError && err.sent > 0 && err.sent < messages.length;
        set({
          send: {
            status: "error",
            presets,
            current,
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
