// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import type { OutgoingMidiMessage } from "./types";

export function noteOn(channel: number, note: number, velocity: number): OutgoingMidiMessage {
  return { kind: "noteOn", channel, note, velocity };
}

export function noteOff(channel: number, note: number, velocity: number): OutgoingMidiMessage {
  return { kind: "noteOff", channel, note, velocity };
}

export function cc(channel: number, controller: number, value: number): OutgoingMidiMessage {
  return { kind: "controlChange", channel, controller, value };
}

export function programChange(channel: number, program: number): OutgoingMidiMessage {
  return { kind: "programChange", channel, program };
}

export function pitchBend(channel: number, value14: number): OutgoingMidiMessage {
  return { kind: "pitchBend", channel, value14 };
}

/**
 * The 14-bit bend value the Pacer sends for one of its 7-bit settings. Pitch bend is the one
 * channel-voice message with 14 bits (LSB then MSB, 0-16383, centre 8192), while a step's range
 * is stored in single SysEx bytes — so the firmware has to spread 0-127 across it.
 *
 * Confirmed on 1.01.12 by sweeping a pedal assigned Pitch Bend, full range: 735 messages, MSB
 * covering 0-127 with LSB 0 throughout — except the two at the very top, which send LSB 127 as
 * well, so full scale is exactly 16383 rather than 16256. No message broke that rule.
 */
export function bendFrom7Bit(value: number): number {
  return value >= 127 ? 16383 : value << 7;
}

export function channelAftertouch(channel: number, value: number): OutgoingMidiMessage {
  return { kind: "channelAftertouch", channel, value };
}

export function mmc(deviceId: number, command: number): OutgoingMidiMessage {
  return { kind: "mmc", deviceId, command };
}

/** Real MIDI byte sequence for display/hex-dump purposes. */
export function midiMessageToBytes(msg: OutgoingMidiMessage): number[] {
  switch (msg.kind) {
    case "noteOn":
      return [0x90 | msg.channel, msg.note, msg.velocity];
    case "noteOff":
      return [0x80 | msg.channel, msg.note, msg.velocity];
    case "controlChange":
      return [0xb0 | msg.channel, msg.controller, msg.value];
    case "programChange":
      return [0xc0 | msg.channel, msg.program];
    case "pitchBend":
      return [0xe0 | msg.channel, msg.value14 & 0x7f, (msg.value14 >> 7) & 0x7f];
    case "channelAftertouch":
      return [0xd0 | msg.channel, msg.value];
    case "mmc":
      return [0xf0, 0x7f, msg.deviceId, 0x06, msg.command, 0xf7];
  }
}
