// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

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

/**
 * The value a controller holds as far as the device is concerned. Nothing remembered means 0:
 * confirmed on hardware (a toggle whose data[1] is 0 shows its first color at rest, and its
 * first press sends data[2]).
 */
export function rememberedCc(state: MidiState, channel: number, controller: number): number {
  return ccValue(state, channel, controller) ?? 0;
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
 * Whether a step shows its *first* LED color (the `activeColor` field, elm 0x41) rather than the
 * second (`inactiveColor`, elm 0x42). Undefined for steps whose light doesn't follow a remembered
 * value (they light while held instead; see `stepLight`).
 *
 * Confirmed on hardware (TOGL test preset, firmware 1.01.12): for a CC step the first color shows
 * while the controller holds **data[1]**, whichever value that is, and the second color otherwise.
 * Five toggles covering [127, 0], [0, 127] and [100, 20] all followed this, at rest and after a
 * press. Every factory and owner preset puts the "pressed" value in data[1], which is why this
 * reads as a plain on/off there.
 * - Note / Note Toggle: the note is sounding.
 * - Program & Bank: the channel's current program is the step's, and so is the bank if the step
 *   sends one.
 */
export function stepValueOn(step: Step, channel: number, state: MidiState): boolean | undefined {
  const [d0, d1, d2] = step.data;
  switch (step.msgType) {
    case SwitchMessageType.CcToggle:
    case SwitchMessageType.CcTrigger:
      return rememberedCc(state, channel, d0) === d1;
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
