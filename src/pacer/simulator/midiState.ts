import { SwitchMessageType } from "../protocol/constants";
import type { Step } from "../protocol/types";
import type { OutgoingMidiMessage } from "./types";

/**
 * The Pacer's device-wide memory of MIDI values, which persists across preset changes. Observed:
 * after sending a Program Change from A1 and visiting another preset, A1's switch for that program
 * is still lit when you come back. The dump's global "Current" block (idx 0) stores the same kind
 * of state: Program Value / Bank LSB / Bank MSB per channel 1-16 (reference project's sysex.md).
 *
 * Steps read it: a CC/Note Toggle's next value, and every MIDI step's light (see `stepValueOn`).
 * The dump's stored values aren't used as a starting point. The factory dump holds program 0 on
 * every channel, yet factory A1's PC0 switch rests dim, so those bytes can't mean "program 0 is
 * active" (their encoding is unknown). A session starts with nothing remembered.
 */
export interface MidiState {
  /** Wire channel (0-15) -> controller -> last value sent. */
  cc: Partial<Record<number, Partial<Record<number, number>>>>;
  /** Wire channel -> note -> whether it's sounding. */
  notes: Partial<Record<number, Partial<Record<number, boolean>>>>;
  /** Wire channel -> the last Program Change, with the bank (CC 0 / CC 32) in effect when it was sent. */
  programs: Partial<Record<number, { program: number; bankMsb?: number; bankLsb?: number }>>;
}

export const EMPTY_MIDI_STATE: MidiState = { cc: {}, notes: {}, programs: {} };

export function ccValue(state: MidiState, channel: number, controller: number): number | undefined {
  return state.cc[channel]?.[controller];
}

export function isNoteOn(state: MidiState, channel: number, note: number): boolean {
  return state.notes[channel]?.[note] === true;
}

/** The state after `messages` are sent, in order. */
export function recordMidi(state: MidiState, messages: readonly OutgoingMidiMessage[]): MidiState {
  let next = state;
  for (const m of messages) {
    switch (m.kind) {
      case "controlChange":
        next = { ...next, cc: { ...next.cc, [m.channel]: { ...next.cc[m.channel], [m.controller]: m.value } } };
        break;
      case "noteOn":
      case "noteOff": {
        const on = m.kind === "noteOn" && m.velocity > 0;
        next = { ...next, notes: { ...next.notes, [m.channel]: { ...next.notes[m.channel], [m.note]: on } } };
        break;
      }
      case "programChange":
        next = {
          ...next,
          programs: {
            ...next.programs,
            [m.channel]: {
              program: m.program,
              bankMsb: ccValue(next, m.channel, 0),
              bankLsb: ccValue(next, m.channel, 32),
            },
          },
        };
        break;
      default:
        break; // pitch bend, aftertouch, MMC: nothing a switch's light reflects
    }
  }
  return next;
}

/**
 * Whether a step's MIDI is in its On ("maximum value") state according to the remembered values;
 * this is what its light shows. Undefined for steps whose light doesn't follow a remembered value
 * (they light while held instead; see `stepLight`).
 * - CC Toggle: the CC holds the step's On value (data 3).
 * - CC Trigger: the CC holds the step's press value (data 2).
 * - Note / Note Toggle: the note is sounding.
 * - Program & Bank: the channel's current program is the step's, and so is the bank if the step
 *   sends one.
 */
export function stepValueOn(step: Step, channel: number, state: MidiState): boolean | undefined {
  const [d0, d1, d2] = step.data;
  switch (step.msgType) {
    case SwitchMessageType.CcToggle:
      return ccValue(state, channel, d0) === d2;
    case SwitchMessageType.CcTrigger:
      return ccValue(state, channel, d0) === d1;
    case SwitchMessageType.Note:
    case SwitchMessageType.NoteToggle:
      return isNoteOn(state, channel, d0);
    case SwitchMessageType.ProgramAndBank: {
      const current = state.programs[channel];
      if (!current || current.program !== d0) return false;
      const sendsBank = d1 !== 0 || d2 !== 0;
      return !sendsBank || (current.bankLsb === d1 && current.bankMsb === d2);
    }
    default:
      return undefined;
  }
}
