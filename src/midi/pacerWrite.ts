// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import type { MidiConnection } from "./webMidi";

export interface SendProgress {
  sent: number;
  total: number;
}

export interface SendOptions {
  outputId: string;
  /**
   * Pause between messages. The Pacer processes each Set as it arrives and has a small input
   * buffer; the reference editor paces its dump uploads at 10 ms per message.
   */
  intervalMs?: number;
  /**
   * Quiet time after the last message before the send counts as finished (see `sendPaced`).
   */
  settleMs?: number;
  onProgress?: (progress: SendProgress) => void;
  signal?: AbortSignal;
}

/**
 * How long the Pacer needs after preset writes before it can safely be asked for a dump.
 *
 * Observed on hardware (firmware 1.01.12, and the build before it: both report "0101"): after a
 * full preset write, a full-dump request sent within 200 ms made the Pacer drop the written data
 * and fill the written preset with D6's contents instead. With a gap of 300 ms or more the write
 * always landed. It happens whether or not the written preset is the loaded one, and a dump
 * requested with no gap still reads the pre-write contents, so writes look buffered: the dump
 * seems to cancel the pending commit and leave the last preset it walked (D6) to be committed in
 * its place. The reference editor waits 1 s before reading back; so do we, a comfortable margin
 * over the observed ~250 ms.
 */
export const PACER_WRITE_SETTLE_MS = 1000;

export class SendError extends Error {
  override name = "SendError";
  constructor(
    message: string,
    /** How many messages went out before the failure. */
    readonly sent: number,
  ) {
    super(message);
  }
}

/**
 * Sends SysEx messages to the Pacer one at a time, paced by `intervalMs`, then waits `settleMs`
 * so the Pacer can commit them. Nothing else may be sent to it until this settles, which is why
 * it doesn't resolve (or reject) earlier. Rejects with a `SendError` if a send fails or the
 * signal aborts; messages already sent stay applied on the device (there's no transaction),
 * which the error's `sent` count reports.
 */
export async function sendPaced(
  connection: MidiConnection,
  messages: readonly Uint8Array[],
  options: SendOptions,
): Promise<void> {
  const { outputId, intervalMs = 10, settleMs = PACER_WRITE_SETTLE_MS, onProgress, signal } = options;
  const total = messages.length;
  let sent = 0;
  onProgress?.({ sent, total });

  try {
    for (; sent < total; sent++) {
      if (signal?.aborted) throw new SendError(`Canceled after ${sent} of ${total} messages`, sent);
      const result = connection.send(outputId, messages[sent]!);
      if (!result.ok) throw new SendError(`Couldn't send to the Pacer: ${result.reason}`, sent);
      onProgress?.({ sent: sent + 1, total });
      if (sent < total - 1) await delay(intervalMs);
    }
  } finally {
    // Also after a failure or cancel: whatever did go out still needs to be committed.
    if (sent > 0) await delay(settleMs);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
