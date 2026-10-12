// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import type { MidiAccessLike, MidiInputPortLike, MidiMessageEventLike, MidiOutputPortLike } from "../webMidi";

export class FakeOutput implements MidiOutputPortLike {
  sent: number[][] = [];
  state: "connected" | "disconnected" = "connected";
  /** Called for each sent message, e.g. to make a fake Pacer answer a dump request. */
  onSend?: (data: number[]) => void;
  constructor(
    public id: string,
    public name: string | null,
  ) {}
  send(data: number[]) {
    this.sent.push(data);
    this.onSend?.(data);
  }
}

export class FakeInput implements MidiInputPortLike {
  state: "connected" | "disconnected" = "connected";
  private listeners = new Set<(event: MidiMessageEventLike) => void>();
  constructor(
    public id: string,
    public name: string | null,
  ) {}
  addEventListener(_type: "midimessage", listener: (event: MidiMessageEventLike) => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: "midimessage", listener: (event: MidiMessageEventLike) => void) {
    this.listeners.delete(listener);
  }
  get listenerCount() {
    return this.listeners.size;
  }
  /** Simulates a message arriving from the device. */
  receive(bytes: ArrayLike<number>) {
    const data = Uint8Array.from(bytes);
    this.listeners.forEach((l) => l({ data }));
  }
}

export class FakeMidiAccess implements MidiAccessLike {
  private listeners = new Set<() => void>();
  constructor(
    public ports: FakeOutput[],
    public sysexEnabled = true,
    public inputPorts: FakeInput[] = [],
  ) {}
  get outputs() {
    return { forEach: (cb: (port: MidiOutputPortLike) => void) => this.ports.forEach(cb) };
  }
  get inputs() {
    return { forEach: (cb: (port: MidiInputPortLike) => void) => this.inputPorts.forEach(cb) };
  }
  addEventListener(_type: "statechange", listener: () => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: "statechange", listener: () => void) {
    this.listeners.delete(listener);
  }
  /** Simulates a port being plugged in or removed. */
  changePorts(ports: FakeOutput[], inputPorts: FakeInput[] = this.inputPorts) {
    this.ports = ports;
    this.inputPorts = inputPorts;
    this.listeners.forEach((l) => l());
  }
}
