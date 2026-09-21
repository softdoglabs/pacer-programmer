import { SwitchMessageType } from "../protocol/constants";
import type { PacerHue } from "../protocol/ledColors";

export interface DefaultLedColor {
  hue: PacerHue;
  /** How the light shows while the step is off: the hue's dimmed "b" variant, or not at all. */
  inactive: "dim" | "off";
}

/**
 * The firmware's default LED color per step message type, used when a step's LED color is
 * "Default" (0x7F). Source: Pacer User Guide p. 12, "LED Color", Chart 2 ("Default Color for
 * Message Type"): "by default each color represent[s] an assignment type". The On color is the
 * hue's full-brightness "A" variant and the Off color its dimmed "b" variant. Matches the
 * hardware: factory A1 (Program Change) rests dim orange, bank B (MIDI CC) dim blue.
 *
 * Exception (observed, cause inferred): factory A-D, whose steps are Preset Select / Preset
 * Inc/Dec with Default colors, are off at rest rather than dim red. We model that as preset
 * navigation resting off. The factory data can't rule out the alternative, "back-row bars
 * ignore the Default colors", because A-D never hold any other step type there. Pressing a
 * navigation switch jumps presets immediately, so its On color is rarely visible anyway.
 *
 * The guide also lists 8 (teal) for "DAW function", a step type ("Nektar DAW Control") this
 * codebase doesn't decode yet. Colors 4, 6 and 12 have no default assignment.
 */
const DEFAULT_BY_MESSAGE_TYPE: Partial<Record<number, DefaultLedColor>> = {
  [SwitchMessageType.StepSelect]: { hue: "pink", inactive: "dim" }, // 1
  [SwitchMessageType.StepIncDec]: { hue: "pink", inactive: "dim" }, // 1
  [SwitchMessageType.PresetSelect]: { hue: "red", inactive: "off" }, // 2
  [SwitchMessageType.PresetIncDec]: { hue: "red", inactive: "off" }, // 2
  [SwitchMessageType.ProgramAndBank]: { hue: "orange", inactive: "dim" }, // 3
  [SwitchMessageType.ProgramStep]: { hue: "orange", inactive: "dim" }, // 3
  [SwitchMessageType.Mmc]: { hue: "yellow", inactive: "dim" }, // 5
  [SwitchMessageType.Note]: { hue: "green", inactive: "dim" }, // 7
  [SwitchMessageType.NoteToggle]: { hue: "green", inactive: "dim" }, // 7
  [SwitchMessageType.CcTrigger]: { hue: "blue", inactive: "dim" }, // 9
  [SwitchMessageType.CcToggle]: { hue: "blue", inactive: "dim" }, // 9
  [SwitchMessageType.CcStep]: { hue: "blue", inactive: "dim" }, // 9
  [SwitchMessageType.Relay]: { hue: "lavender", inactive: "dim" }, // 10
  [SwitchMessageType.NrpnCoarse]: { hue: "purple", inactive: "dim" }, // 11
  [SwitchMessageType.NrpnFine]: { hue: "purple", inactive: "dim" }, // 11
};

/** The default LED color for a switch step's message type, or undefined if the guide assigns none. */
export function defaultLedColor(msgType: number): DefaultLedColor | undefined {
  return DEFAULT_BY_MESSAGE_TYPE[msgType];
}
