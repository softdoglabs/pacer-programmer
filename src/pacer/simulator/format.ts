import { presetIndexToLabel } from "../protocol/constants";
import { midiMessageToBytes } from "./midiMessages";
import type { BoardEffect, DeviceAction, OutgoingMidiMessage } from "./types";

function hex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

export function formatMidiMessage(msg: OutgoingMidiMessage): string {
  const bytes = hex(midiMessageToBytes(msg));
  switch (msg.kind) {
    case "noteOn":
      return `CH${msg.channel + 1} Note On #${msg.note} vel ${msg.velocity} [${bytes}]`;
    case "noteOff":
      return `CH${msg.channel + 1} Note Off #${msg.note} vel ${msg.velocity} [${bytes}]`;
    case "controlChange":
      return `CH${msg.channel + 1} CC#${msg.controller} = ${msg.value} [${bytes}]`;
    case "programChange":
      return `CH${msg.channel + 1} Program Change ${msg.program} [${bytes}]`;
    case "pitchBend":
      return `CH${msg.channel + 1} Pitch Bend ${msg.value14} [${bytes}]`;
    case "channelAftertouch":
      return `CH${msg.channel + 1} Channel Aftertouch ${msg.value} [${bytes}]`;
    case "mmc":
      return `MMC device ${msg.deviceId} command ${msg.command} [${bytes}]`;
  }
}

export function formatDeviceAction(action: DeviceAction): string {
  switch (action.kind) {
    case "presetJump":
      return `Preset jump -> ${presetIndexToLabel(action.targetIndex)} (idx ${action.targetIndex}), no MIDI sent`;
    case "presetRelative":
      return `Preset ${action.direction === "next" ? "next" : "previous"}, no MIDI sent`;
    case "relay":
      return `Relay R${action.relayIndex + 1} mode ${action.mode}`;
    case "specialPreset":
      return `Enter built-in ${action.preset === "track" ? "Track" : "Transport"} preset, no MIDI sent`;
  }
}

export function formatBoardEffect(effect: BoardEffect): string[] {
  const lines: string[] = [];
  for (const msg of effect.messages) lines.push(formatMidiMessage(msg));
  for (const relay of effect.relayActions) lines.push(formatDeviceAction(relay));
  if (effect.presetChanged) {
    lines.push(
      `Preset changed: ${presetIndexToLabel(effect.presetChanged.from)} -> ${presetIndexToLabel(effect.presetChanged.to)}`,
    );
  }
  if (effect.specialPresetRequested) {
    lines.push(formatDeviceAction({ kind: "specialPreset", preset: effect.specialPresetRequested }));
  }
  for (const warning of effect.warnings) lines.push(`(warning) ${warning}`);
  return lines;
}
