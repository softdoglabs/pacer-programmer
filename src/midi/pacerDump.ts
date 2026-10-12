// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { EXPECTED_FULL_DUMP_MESSAGES, buildFullDumpRequest, isPacerDataMessage } from "../pacer/protocol/requests";
import type { MidiConnection, MidiPortInfo } from "./webMidi";

export interface PacerPorts {
  inputId?: string;
  outputId?: string;
}

/** The Pacer's USB MIDI ports, recognized by name ("PACER" on macOS/Windows; the reference editor matches /Pacer/i too). */
export function findPacerPorts(inputs: MidiPortInfo[], outputs: MidiPortInfo[]): PacerPorts {
  const isPacer = (p: MidiPortInfo) => /pacer/i.test(p.name);
  return { inputId: inputs.find(isPacer)?.id, outputId: outputs.find(isPacer)?.id };
}

export interface DumpProgress {
  received: number;
  expected: number;
}

export interface PullOptions {
  inputId: string;
  outputId: string;
  /** Give up if the Pacer hasn't started answering by then. */
  firstReplyTimeoutMs?: number;
  /** The dump is complete once no message has arrived for this long. */
  idleMs?: number;
  /** Once this many messages have arrived, wait only `settleMs` for stragglers. */
  expectedMessages?: number;
  settleMs?: number;
  onProgress?: (progress: DumpProgress) => void;
  signal?: AbortSignal;
}

export class DumpError extends Error {
  override name = "DumpError";
}

/**
 * Asks the Pacer for its full configuration and collects the reply. Resolves with the raw SysEx
 * bytes (every Pacer data message concatenated, in arrival order: the same format as a .syx
 * file). There's no end-of-dump marker in the protocol, so completion is detected by the stream
 * going quiet: `idleMs` normally, or `settleMs` once the expected count has arrived.
 */
export function pullFullDump(connection: MidiConnection, options: PullOptions): Promise<Uint8Array> {
  const {
    inputId,
    outputId,
    firstReplyTimeoutMs = 5000,
    idleMs = 1500,
    expectedMessages = EXPECTED_FULL_DUMP_MESSAGES,
    settleMs = 200,
    onProgress,
    signal,
  } = options;

  return new Promise((resolve, reject) => {
    const messages: Uint8Array[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const finish = (outcome: { bytes: Uint8Array } | { error: DumpError }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      signal?.removeEventListener("abort", onAbort);
      if ("error" in outcome) reject(outcome.error);
      else resolve(outcome.bytes);
    };

    const complete = () => {
      const total = messages.reduce((n, m) => n + m.length, 0);
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const m of messages) {
        bytes.set(m, offset);
        offset += m.length;
      }
      finish({ bytes });
    };

    const onAbort = () => finish({ error: new DumpError("Cancelled") });

    const unsubscribe = connection.listen(inputId, (data) => {
      if (!isPacerDataMessage(data)) return;
      messages.push(Uint8Array.from(data));
      onProgress?.({ received: messages.length, expected: expectedMessages });
      clearTimeout(timer);
      timer = setTimeout(complete, messages.length >= expectedMessages ? settleMs : idleMs);
    });
    if (!unsubscribe) {
      finish({ error: new DumpError("The Pacer's MIDI input port isn't connected") });
      return;
    }
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort);

    const sent = connection.send(outputId, buildFullDumpRequest());
    if (!sent.ok) {
      finish({ error: new DumpError(`Couldn't send the dump request: ${sent.reason}`) });
      return;
    }
    onProgress?.({ received: 0, expected: expectedMessages });
    timer = setTimeout(
      () =>
        finish({
          error: new DumpError(
            "No reply from the Pacer. Check that it's connected over USB and that the right MIDI ports are selected.",
          ),
        }),
      firstReplyTimeoutMs,
    );
  });
}
