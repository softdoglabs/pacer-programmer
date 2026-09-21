import type { MidiAccessLike, MidiOutputPortLike } from "../webMidi";

export class FakeOutput implements MidiOutputPortLike {
  sent: number[][] = [];
  state: "connected" | "disconnected" = "connected";
  constructor(
    public id: string,
    public name: string | null,
  ) {}
  send(data: number[]) {
    this.sent.push(data);
  }
}

export class FakeMidiAccess implements MidiAccessLike {
  private listeners = new Set<() => void>();
  constructor(
    public ports: FakeOutput[],
    public sysexEnabled = true,
  ) {}
  get outputs() {
    return { forEach: (cb: (port: MidiOutputPortLike) => void) => this.ports.forEach(cb) };
  }
  addEventListener(_type: "statechange", listener: () => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: "statechange", listener: () => void) {
    this.listeners.delete(listener);
  }
  /** Simulates a port being plugged in or removed. */
  changePorts(ports: FakeOutput[]) {
    this.ports = ports;
    this.listeners.forEach((l) => l());
  }
}
