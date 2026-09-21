/*
 * A thin wrapper over the Web MIDI API (browser-only; Chromium-based browsers support SysEx).
 * Typed against minimal structural interfaces rather than the DOM's MIDIAccess types, so tests
 * can pass fakes and nothing else in the app touches `navigator` directly.
 */

export interface MidiOutputPortLike {
  id: string;
  name: string | null;
  state: "connected" | "disconnected";
  send(data: number[]): void;
}

export interface MidiAccessLike {
  readonly outputs: { forEach(cb: (port: MidiOutputPortLike) => void): void };
  readonly sysexEnabled: boolean;
  addEventListener(type: "statechange", listener: () => void): void;
  removeEventListener(type: "statechange", listener: () => void): void;
}

export type MidiAccessRequester = (options: { sysex: boolean }) => Promise<MidiAccessLike>;

export interface MidiOutputInfo {
  id: string;
  name: string;
}

export type SendResult = { ok: true } | { ok: false; reason: string };

function isSysex(bytes: readonly number[]): boolean {
  return bytes[0] === 0xf0;
}

export class MidiConnection {
  constructor(private readonly access: MidiAccessLike) {}

  /** Whether SysEx may be sent (the user granted the SysEx permission). */
  get sysexEnabled(): boolean {
    return this.access.sysexEnabled;
  }

  /** Currently connected output ports, sorted by name. */
  outputs(): MidiOutputInfo[] {
    const ports: MidiOutputInfo[] = [];
    this.access.outputs.forEach((port) => {
      if (port.state === "connected") ports.push({ id: port.id, name: port.name ?? port.id });
    });
    return ports.sort((a, b) => a.name.localeCompare(b.name));
  }

  send(outputId: string, bytes: readonly number[]): SendResult {
    let port: MidiOutputPortLike | undefined;
    this.access.outputs.forEach((p) => {
      if (p.id === outputId) port = p;
    });
    if (!port || port.state !== "connected") return { ok: false, reason: "output port is not connected" };
    if (isSysex(bytes) && !this.sysexEnabled) return { ok: false, reason: "SysEx permission not granted" };
    try {
      port.send([...bytes]);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Calls `listener` whenever ports are plugged in or removed. Returns an unsubscribe function. */
  onPortsChanged(listener: () => void): () => void {
    this.access.addEventListener("statechange", listener);
    return () => this.access.removeEventListener("statechange", listener);
  }
}

export type ConnectResult =
  { kind: "connected"; connection: MidiConnection } | { kind: "unsupported" } | { kind: "denied"; message: string };

/** The browser's requester, or undefined where Web MIDI isn't available (Firefox without an add-on, Safari, Node). */
export function browserMidiRequester(): MidiAccessRequester | undefined {
  const nav = globalThis.navigator as (Navigator & { requestMIDIAccess?: unknown }) | undefined;
  if (typeof nav?.requestMIDIAccess !== "function") return undefined;
  return (options) => nav.requestMIDIAccess(options) as unknown as Promise<MidiAccessLike>;
}

/**
 * Requests MIDI access. It asks for SysEx first (needed for MMC now, and later for talking to the
 * Pacer itself), then falls back to plain MIDI if the user or browser refuses SysEx.
 */
export async function connectMidi(
  requester: MidiAccessRequester | undefined = browserMidiRequester(),
): Promise<ConnectResult> {
  if (!requester) return { kind: "unsupported" };
  try {
    return { kind: "connected", connection: new MidiConnection(await requester({ sysex: true })) };
  } catch {
    try {
      return { kind: "connected", connection: new MidiConnection(await requester({ sysex: false })) };
    } catch (err) {
      return { kind: "denied", message: err instanceof Error ? err.message : String(err) };
    }
  }
}
