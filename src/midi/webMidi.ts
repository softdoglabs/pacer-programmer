/*
 * A thin wrapper over the Web MIDI API (browser-only).
 * Typed against minimal structural interfaces rather than the DOM's MIDIAccess types, so tests
 * can pass fakes and nothing else in the app touches `navigator` directly.
 */

export interface MidiOutputPortLike {
  id: string;
  name: string | null;
  state: "connected" | "disconnected";
  send(data: number[]): void;
}

export interface MidiMessageEventLike {
  data: Uint8Array | null;
}

export interface MidiInputPortLike {
  id: string;
  name: string | null;
  state: "connected" | "disconnected";
  addEventListener(type: "midimessage", listener: (event: MidiMessageEventLike) => void): void;
  removeEventListener(type: "midimessage", listener: (event: MidiMessageEventLike) => void): void;
}

export interface MidiAccessLike {
  readonly inputs: { forEach(cb: (port: MidiInputPortLike) => void): void };
  readonly outputs: { forEach(cb: (port: MidiOutputPortLike) => void): void };
  readonly sysexEnabled: boolean;
  addEventListener(type: "statechange", listener: () => void): void;
  removeEventListener(type: "statechange", listener: () => void): void;
}

export type MidiAccessRequester = (options: { sysex: boolean }) => Promise<MidiAccessLike>;

export interface MidiPortInfo {
  id: string;
  name: string;
}

/** An output port (same shape as any port). */
export type MidiOutputInfo = MidiPortInfo;

function connectedPorts(ports: {
  forEach(cb: (port: { id: string; name: string | null; state: string }) => void): void;
}) {
  const found: MidiPortInfo[] = [];
  ports.forEach((port) => {
    if (port.state === "connected") found.push({ id: port.id, name: port.name ?? port.id });
  });
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

export type SendResult = { ok: true } | { ok: false; reason: string };

function isSysex(bytes: ArrayLike<number>): boolean {
  return bytes[0] === 0xf0;
}

export class MidiConnection {
  constructor(private readonly access: MidiAccessLike) {}

  /** Whether SysEx may be sent (the user granted the SysEx permission). */
  get sysexEnabled(): boolean {
    return this.access.sysexEnabled;
  }

  /** Currently connected output ports, sorted by name. */
  outputs(): MidiPortInfo[] {
    return connectedPorts(this.access.outputs);
  }

  /** Currently connected input ports, sorted by name. */
  inputs(): MidiPortInfo[] {
    return connectedPorts(this.access.inputs);
  }

  /**
   * Delivers every message arriving on an input port (SysEx arrives as one complete message).
   * Returns an unsubscribe function, or undefined if the port isn't connected.
   */
  listen(inputId: string, onMessage: (bytes: Uint8Array) => void): (() => void) | undefined {
    let port: MidiInputPortLike | undefined;
    this.access.inputs.forEach((p) => {
      if (p.id === inputId && p.state === "connected") port = p;
    });
    if (!port) return undefined;
    const listener = (event: MidiMessageEventLike) => {
      if (event.data) onMessage(event.data);
    };
    port.addEventListener("midimessage", listener);
    return () => port!.removeEventListener("midimessage", listener);
  }

  send(outputId: string, bytes: ArrayLike<number>): SendResult {
    let port: MidiOutputPortLike | undefined;
    this.access.outputs.forEach((p) => {
      if (p.id === outputId) port = p;
    });
    if (!port || port.state !== "connected") return { ok: false, reason: "output port is not connected" };
    if (isSysex(bytes) && !this.sysexEnabled) return { ok: false, reason: "SysEx permission not granted" };
    try {
      port.send(Array.from(bytes));
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

/** The browser's requester, or undefined where Web MIDI isn't available (some browsers, Node). */
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
