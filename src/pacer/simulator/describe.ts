import {
  ExpressionMessageType,
  PresetMidiMessageType,
  PresetSelectTarget,
  SwitchMessageType,
} from "../protocol/constants";
import type { Step, SwitchControl } from "../protocol/types";
import type { ControlKind } from "./controlEffects";

interface MessageTypeInfo {
  name: string;
  /** Meaning of data[0..2]; `undefined` marks a byte that's unused for this type. */
  dataFields: [string | undefined, string | undefined, string | undefined];
}

/** Data-byte meanings mirror the layouts implemented in stepEffects.ts. */
const SWITCH_TYPES: Partial<Record<number, MessageTypeInfo>> = {
  [SwitchMessageType.Off]: { name: "Off", dataFields: [undefined, undefined, undefined] },
  [SwitchMessageType.CcTrigger]: { name: "CC Trigger", dataFields: ["CC#", "Press", "Release"] },
  [SwitchMessageType.CcToggle]: { name: "CC Toggle", dataFields: ["CC#", "Off", "On"] },
  [SwitchMessageType.CcStep]: { name: "CC Step", dataFields: ["CC#", "Start", "End"] },
  [SwitchMessageType.Note]: { name: "Note", dataFields: ["Note", "Velocity", undefined] },
  [SwitchMessageType.NoteToggle]: { name: "Note Toggle", dataFields: ["Note", "Velocity", undefined] },
  [SwitchMessageType.ProgramAndBank]: { name: "Program + Bank", dataFields: ["Program", "Bank LSB", "Bank MSB"] },
  [SwitchMessageType.ProgramStep]: { name: "Program Step", dataFields: [undefined, "Start", "End"] },
  [SwitchMessageType.NrpnCoarse]: { name: "NRPN Coarse", dataFields: ["Value", "NRPN LSB", "NRPN MSB"] },
  [SwitchMessageType.NrpnFine]: { name: "NRPN Fine", dataFields: ["Value", "NRPN LSB", "NRPN MSB"] },
  [SwitchMessageType.Mmc]: { name: "MMC", dataFields: ["Device", "Command", undefined] },
  [SwitchMessageType.Relay]: { name: "Relay", dataFields: ["Mode", "Relay", undefined] },
  [SwitchMessageType.PresetSelect]: { name: "Preset Select", dataFields: ["Target", undefined, undefined] },
  [SwitchMessageType.PresetIncDec]: { name: "Preset Inc/Dec", dataFields: ["Direction", undefined, undefined] },
  [SwitchMessageType.StepSelect]: { name: "Step Select", dataFields: ["Data 1", "Data 2", "Data 3"] },
  [SwitchMessageType.StepIncDec]: { name: "Step Inc/Dec", dataFields: ["Data 1", "Data 2", "Data 3"] },
};

const EXPRESSION_TYPES: Partial<Record<number, MessageTypeInfo>> = {
  [ExpressionMessageType.Off]: { name: "Off", dataFields: [undefined, undefined, undefined] },
  [ExpressionMessageType.MidiCc]: { name: "MIDI CC", dataFields: ["CC#", "Min", "Max"] },
  [ExpressionMessageType.PitchBend]: { name: "Pitch Bend", dataFields: [undefined, "Min", "Max"] },
  [ExpressionMessageType.ChannelAftertouch]: { name: "Channel Aftertouch", dataFields: [undefined, "Min", "Max"] },
  [ExpressionMessageType.NrpnCoarse]: { name: "NRPN Coarse", dataFields: ["Max", "NRPN LSB", "NRPN MSB"] },
  [ExpressionMessageType.NrpnFine]: { name: "NRPN Fine", dataFields: ["Max", "NRPN LSB", "NRPN MSB"] },
};

export function messageTypeInfo(kind: ControlKind, msgType: number): MessageTypeInfo {
  const table = kind === "switch" ? SWITCH_TYPES : EXPRESSION_TYPES;
  return table[msgType] ?? { name: `Unknown 0x${msgType.toString(16)}`, dataFields: ["Data 1", "Data 2", "Data 3"] };
}

function presetTargetLabel(target: number): string {
  return PresetSelectTarget[target] ?? `#${target}`;
}

/** A very short description of one step, sized for the faceplate's legend panel (e.g. "PC 5", "→B1"). */
export function describeStepShort(step: Step, kind: ControlKind): string {
  const [d0, d1] = step.data;
  if (kind === "expressionPedal") {
    switch (step.msgType) {
      case ExpressionMessageType.MidiCc:
        return `CC${d0}`;
      case ExpressionMessageType.PitchBend:
        return "PB";
      case ExpressionMessageType.ChannelAftertouch:
        return "AT";
      case ExpressionMessageType.NrpnCoarse:
      case ExpressionMessageType.NrpnFine:
        return "NRPN";
      default:
        return messageTypeInfo(kind, step.msgType).name;
    }
  }
  switch (step.msgType) {
    case SwitchMessageType.CcTrigger:
    case SwitchMessageType.CcStep:
      return `CC${d0}`;
    case SwitchMessageType.CcToggle:
      return `CC${d0}⇅`;
    case SwitchMessageType.Note:
      return `N${d0}`;
    case SwitchMessageType.NoteToggle:
      return `N${d0}⇅`;
    case SwitchMessageType.ProgramAndBank:
      return `PC${d0}`;
    case SwitchMessageType.ProgramStep:
      return `PC${step.data[1]}+`;
    case SwitchMessageType.NrpnCoarse:
    case SwitchMessageType.NrpnFine:
      return "NRPN";
    case SwitchMessageType.Mmc:
      return `MMC${d1}`;
    case SwitchMessageType.Relay:
      return `R${d1 + 1}`;
    case SwitchMessageType.PresetSelect:
      return `→${presetTargetLabel(d0)}`;
    case SwitchMessageType.PresetIncDec:
      return d0 === 0 ? "P+" : "P−";
    case SwitchMessageType.StepSelect:
    case SwitchMessageType.StepIncDec:
      return "STEP";
    default:
      return messageTypeInfo(kind, step.msgType).name;
  }
}

function activeSteps(control: SwitchControl): [number, Step][] {
  return Object.entries(control.steps)
    .map(([n, step]) => [Number(n), step] as [number, Step | undefined])
    .filter((entry): entry is [number, Step] => entry[1]?.active === true)
    .sort(([a], [b]) => a - b);
}

/** Legend text for a control on the faceplate: its active steps' short forms, or "—" when nothing fires. */
export function summarizeControl(control: SwitchControl | undefined, kind: ControlKind, maxParts = 3): string {
  if (!control) return "—";
  const parts = activeSteps(control)
    .filter(([, step]) => messageTypeInfo(kind, step.msgType).name !== "Off")
    .map(([, step]) => describeStepShort(step, kind));
  if (parts.length === 0) return "—";
  if (parts.length > maxParts) return `${parts.slice(0, maxParts).join(" ")} …`;
  return parts.join(" ");
}

const PRESET_MIDI_TYPE_NAMES: Partial<Record<number, string>> = {
  [PresetMidiMessageType.Cc]: "CC",
  [PresetMidiMessageType.Note]: "Note",
  [PresetMidiMessageType.ProgramAndBank]: "Program + Bank",
  [PresetMidiMessageType.NrpnCoarse]: "NRPN Coarse",
  [PresetMidiMessageType.NrpnFine]: "NRPN Fine",
  [PresetMidiMessageType.Mmc]: "MMC",
  [PresetMidiMessageType.Relay]: "Relay",
  [PresetMidiMessageType.Off]: "Off",
};

/** Name of a preset-level MIDI setting's message type (a different code table from control steps). */
export function presetMidiTypeName(msgType: number): string {
  return PRESET_MIDI_TYPE_NAMES[msgType] ?? `Unknown 0x${msgType.toString(16)}`;
}

/*
 * What a preset message's three data bytes mean, per the User Guide's MIDI Configuration chart.
 * These differ from the step layouts of the same names: a preset CC is (controller, value), where
 * a switch's CC Toggle is (controller, press 1, press 2). `undefined` means the byte is unused.
 */
const PRESET_MIDI_DATA_FIELDS: Partial<Record<number, [string?, string?, string?]>> = {
  [PresetMidiMessageType.Cc]: ["CC", "Value"],
  [PresetMidiMessageType.Note]: ["Note", "Velocity"],
  [PresetMidiMessageType.ProgramAndBank]: ["Program", "Bank LSB", "Bank MSB"],
  [PresetMidiMessageType.NrpnCoarse]: ["Value", "LSB", "MSB"],
  [PresetMidiMessageType.NrpnFine]: ["Value", "LSB", "MSB"],
  [PresetMidiMessageType.Mmc]: ["Device ID", "Command"],
  [PresetMidiMessageType.Relay]: ["Mode", "Relay"],
  [PresetMidiMessageType.Off]: [],
};

/** Types that don't transmit on a MIDI channel (the chart's "n/a"). */
const PRESET_MIDI_NO_CHANNEL: readonly number[] = [
  PresetMidiMessageType.Mmc,
  PresetMidiMessageType.Relay,
  PresetMidiMessageType.Off,
];

export interface PresetMidiTypeInfo {
  name: string;
  /** Label per data byte; `undefined` where the type doesn't use it. */
  dataFields: [string?, string?, string?];
  hasChannel: boolean;
}

export function presetMidiTypeInfo(msgType: number): PresetMidiTypeInfo {
  return {
    name: presetMidiTypeName(msgType),
    dataFields: PRESET_MIDI_DATA_FIELDS[msgType] ?? ["Data 1", "Data 2", "Data 3"],
    hasChannel: !PRESET_MIDI_NO_CHANNEL.includes(msgType),
  };
}

/** A step's (or preset MIDI setting's) channel byte for display: 0 is "Global", 1-16 are MIDI channels. */
export function channelLabel(channelByte: number): string {
  return channelByte === 0 ? "Global" : String(channelByte);
}
