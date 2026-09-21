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
