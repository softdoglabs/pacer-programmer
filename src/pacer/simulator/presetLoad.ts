import { PresetMidiMessageType } from "../protocol/constants";
import { globalMidiChannel, wireChannel } from "../protocol/globalSettings";
import type { PacerConfig, PresetMidiSetting } from "../protocol/types";
import { cc, mmc, noteOn, programChange } from "./midiMessages";
import type { DeviceAction, OutgoingMidiMessage } from "./types";

/*
 * What a preset fires when it's recalled: up to 16 messages stored with the preset itself rather
 * than with any switch (User Guide, "MIDI Configuration"). The hardware sends them immediately on
 * recall, which is what lets one press reconfigure a whole rig.
 *
 * There is no counterpart for leaving a preset — the guide documents this hook alone. Acting on
 * the way out is done with a step on the switch that leaves, firing alongside its Preset Select.
 *
 * The data bytes mean different things here than in a control step of the same name (a preset CC
 * is controller/value; a step's CC Toggle is controller/press-1/press-2), so this reads them per
 * the guide's own chart rather than sharing the step code.
 */

export interface PresetLoadEffect {
  messages: OutgoingMidiMessage[];
  relayActions: Extract<DeviceAction, { kind: "relay" }>[];
}

const EMPTY: PresetLoadEffect = { messages: [], relayActions: [] };

function fireSetting(setting: PresetMidiSetting, globalChannel: number): PresetLoadEffect {
  const { msgType, data } = setting;
  if (msgType === PresetMidiMessageType.Relay) {
    const [mode, relay] = data;
    return { messages: [], relayActions: [{ kind: "relay", relayIndex: relay, mode }] };
  }
  if (msgType === PresetMidiMessageType.Mmc) {
    const [device, command] = data;
    return { ...EMPTY, messages: [mmc(device, command)] };
  }
  const channel = wireChannel(setting.channel, globalChannel);
  if (channel === undefined) return EMPTY;

  switch (msgType) {
    case PresetMidiMessageType.Cc: {
      const [controller, value] = data;
      return { ...EMPTY, messages: [cc(channel, controller, value)] };
    }
    case PresetMidiMessageType.Note: {
      // Assumed: a note-on only. The hardware has no obvious moment to release it, and the guide
      // gives the setting a velocity but no duration or note-off.
      const [note, velocity] = data;
      return { ...EMPTY, messages: [noteOn(channel, note, velocity)] };
    }
    case PresetMidiMessageType.ProgramAndBank: {
      const [program, bankLsb, bankMsb] = data;
      const messages: OutgoingMidiMessage[] = [];
      if (bankLsb || bankMsb) {
        messages.push(cc(channel, 32, bankLsb));
        messages.push(cc(channel, 0, bankMsb));
      }
      messages.push(programChange(channel, program));
      return { ...EMPTY, messages };
    }
    case PresetMidiMessageType.NrpnCoarse: {
      const [value, nrpnLsb, nrpnMsb] = data;
      return { ...EMPTY, messages: [cc(channel, 99, nrpnMsb), cc(channel, 98, nrpnLsb), cc(channel, 6, value)] };
    }
    case PresetMidiMessageType.NrpnFine: {
      const [value, nrpnLsb, nrpnMsb] = data;
      return { ...EMPTY, messages: [cc(channel, 99, nrpnMsb), cc(channel, 98, nrpnLsb), cc(channel, 38, value)] };
    }
    default:
      return EMPTY; // Off, or a type we don't model (the guide's DAW control)
  }
}

/** Everything a preset sends on recall, in slot order. Slots set to Off send nothing. */
export function presetLoadEffect(config: PacerConfig, presetIndex: number): PresetLoadEffect {
  const preset = config.presets[presetIndex];
  if (!preset) return EMPTY;
  const globalChannel = globalMidiChannel(config);
  const numbers = Object.keys(preset.midiSettings)
    .map(Number)
    .sort((a, b) => a - b);
  const effect: PresetLoadEffect = { messages: [], relayActions: [] };
  for (const n of numbers) {
    const setting = preset.midiSettings[n];
    if (!setting || setting.msgType === PresetMidiMessageType.Off) continue;
    const fired = fireSetting(setting, globalChannel);
    effect.messages.push(...fired.messages);
    effect.relayActions.push(...fired.relayActions);
  }
  return effect;
}
