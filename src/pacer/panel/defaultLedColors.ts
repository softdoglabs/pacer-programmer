import { SwitchMessageType } from "../protocol/constants";
import type { PacerHue } from "../protocol/ledColors";

/**
 * The firmware's default LED color per step message type, used when a step's LED color is
 * "Default" (0x7F). Source: Pacer User Guide p. 12, "LED Color", Chart 2 ("Default Color for
 * Message Type"): "by default each color represent[s] an assignment type". The On color is the
 * hue's full-brightness "A" variant and the Off color its dimmed "b" variant. Matches the
 * hardware: factory A1 (Program Change) rests dim orange, bank B (MIDI CC) dim blue.
 *
 * Preset navigation steps have default hues too (2, red), but their lights have fixed roles
 * that don't use the On/Off colors at rest (see `stepLight`). That's why factory A-D are dark.
 *
 * The guide also lists 8 (teal) for "DAW function", a step type ("Nektar DAW Control") this
 * codebase doesn't decode yet. Colors 4, 6 and 12 have no default assignment.
 */
const DEFAULT_HUE_BY_MESSAGE_TYPE: Partial<Record<number, PacerHue>> = {
  [SwitchMessageType.StepSelect]: "pink", // 1
  [SwitchMessageType.StepIncDec]: "pink", // 1
  [SwitchMessageType.PresetSelect]: "red", // 2
  [SwitchMessageType.PresetIncDec]: "red", // 2
  [SwitchMessageType.ProgramAndBank]: "orange", // 3
  [SwitchMessageType.ProgramStep]: "orange", // 3
  [SwitchMessageType.Mmc]: "yellow", // 5
  [SwitchMessageType.Note]: "green", // 7
  [SwitchMessageType.NoteToggle]: "green", // 7
  [SwitchMessageType.CcTrigger]: "blue", // 9
  [SwitchMessageType.CcToggle]: "blue", // 9
  [SwitchMessageType.CcStep]: "blue", // 9
  [SwitchMessageType.Relay]: "lavender", // 10
  [SwitchMessageType.NrpnCoarse]: "purple", // 11
  [SwitchMessageType.NrpnFine]: "purple", // 11
};

/** The default hue for a switch step's message type, or undefined if the guide assigns none. */
export function defaultLedHue(msgType: number): PacerHue | undefined {
  return DEFAULT_HUE_BY_MESSAGE_TYPE[msgType];
}
