import { buildIdentityRequest, parseIdentityReply, type DeviceIdentity } from "../pacer/protocol/identity";
import type { MidiConnection } from "./webMidi";

export type IdentityResult =
  | { kind: "identified"; identity: DeviceIdentity }
  /** The device didn't answer. It may just not support Device Inquiry, so this isn't an error. */
  | { kind: "noReply" }
  | { kind: "error"; message: string };

/** Sends a MIDI Device Inquiry and waits briefly for the Identity Reply on `inputId`. */
export function queryDeviceIdentity(
  connection: MidiConnection,
  { inputId, outputId, timeoutMs = 1000 }: { inputId: string; outputId: string; timeoutMs?: number },
): Promise<IdentityResult> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined = undefined; // set once the request is sent
    const done = (result: IdentityResult) => {
      clearTimeout(timer);
      unsubscribe?.();
      resolve(result);
    };
    const unsubscribe = connection.listen(inputId, (bytes) => {
      const identity = parseIdentityReply(bytes);
      if (identity) done({ kind: "identified", identity });
    });
    if (!unsubscribe) return done({ kind: "error", message: "The Pacer's MIDI input port isn't connected" });
    const sent = connection.send(outputId, buildIdentityRequest());
    if (!sent.ok) return done({ kind: "error", message: `Couldn't send the identity request: ${sent.reason}` });
    timer = setTimeout(() => done({ kind: "noReply" }), timeoutMs);
  });
}
