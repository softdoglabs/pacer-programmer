import {
  ExpressionMessageType,
  PresetSelectTarget,
  SwitchMessageType,
  presetSelectTargetToIndex,
} from "../protocol/constants";
import type { Step } from "../protocol/types";
import { cc, channelAftertouch, mmc, noteOff, noteOn, pitchBend, programChange } from "./midiMessages";
import { ccValue, isNoteOn, type MidiState } from "./midiState";
import type { ControlPhase, DeviceAction, OutgoingMidiMessage } from "./types";

/**
 * What a step can read when it fires: its own step counter (CC/Program Step), sliced out by the
 * caller (controlEffects.ts), and the device's remembered MIDI values, which the toggle types
 * follow (see midiState.ts).
 */
export interface StepSubState {
  counter?: number;
  midi: MidiState;
}

export interface StepFireResult {
  messages: OutgoingMidiMessage[];
  deviceActions: DeviceAction[];
  /** Present only when this step advances its own step counter (CC/Program Step). */
  runtimePatch?: { counter: number };
  warnings: string[];
}

function empty(): StepFireResult {
  return { messages: [], deviceActions: [], warnings: [] };
}

function warn(message: string): StepFireResult {
  return { messages: [], deviceActions: [], warnings: [message] };
}

/**
 * Steps a value from `start` to `end`, wrapping back to `start` — used by CcStep/ProgramStep.
 * `current` is the value to send NOW; the returned `next` is what the NEXT press should send.
 * Wrap direction/amount (+1 per press) is an assumption — see CLAUDE.md / the simulator plan.
 */
function stepRange(counter: number | undefined, start: number, end: number): { current: number; next: number } {
  const current = counter ?? start;
  const next = current >= end ? start : current + 1;
  return { current, next };
}

/**
 * Implements the SwitchMessageType data-byte layout and press/release behavior documented in
 * the simulator plan's data-byte-layout table (itself taken from the reference project's own
 * `MSG_TYPES_DATA_HELP`, not guessed) for stompswitches/footswitches.
 */
export function fireSwitchStep(
  step: Step,
  phase: ControlPhase,
  subState: StepSubState,
  /** The wire channel (0-15) to transmit on, already resolved from `step.channel` (see `wireChannel`). */
  channel: number,
): StepFireResult {
  const { msgType, data } = step;

  switch (msgType) {
    case SwitchMessageType.Off:
      return empty();

    case SwitchMessageType.CcTrigger: {
      const [controller, down, up] = data;
      return { ...empty(), messages: [cc(channel, controller, phase === "press" ? down : up)] };
    }

    case SwitchMessageType.CcToggle: {
      if (phase === "release") return empty();
      // Toggles follow the device's remembered value for this CC, not a per-switch bit, so the
      // state survives preset changes and is shared by every switch toggling the same CC.
      const [controller, offValue, onValue] = data;
      const isOn = ccValue(subState.midi, channel, controller) === onValue;
      return { ...empty(), messages: [cc(channel, controller, isOn ? offValue : onValue)] };
    }

    case SwitchMessageType.CcStep: {
      if (phase === "release") return empty();
      const [controller, start, end] = data;
      const { current, next } = stepRange(subState.counter, start, end);
      return {
        messages: [cc(channel, controller, current)],
        deviceActions: [],
        runtimePatch: { counter: next },
        warnings: [],
      };
    }

    case SwitchMessageType.Note: {
      const [note, velocity] = data;
      return {
        ...empty(),
        messages: [phase === "press" ? noteOn(channel, note, velocity) : noteOff(channel, note, 0)],
      };
    }

    case SwitchMessageType.NoteToggle: {
      if (phase === "release") return empty();
      const [note, velocity] = data;
      const sounding = isNoteOn(subState.midi, channel, note);
      return { ...empty(), messages: [sounding ? noteOff(channel, note, 0) : noteOn(channel, note, velocity)] };
    }

    case SwitchMessageType.ProgramAndBank: {
      if (phase === "release") return empty();
      const [program, bankLsb, bankMsb] = data;
      const messages: OutgoingMidiMessage[] = [];
      if (bankLsb || bankMsb) {
        messages.push(cc(channel, 32, bankLsb));
        messages.push(cc(channel, 0, bankMsb));
      }
      messages.push(programChange(channel, program));
      return { ...empty(), messages };
    }

    case SwitchMessageType.ProgramStep: {
      if (phase === "release") return empty();
      const [, start, end] = data;
      const { current, next } = stepRange(subState.counter, start, end);
      return {
        messages: [programChange(channel, current)],
        deviceActions: [],
        runtimePatch: { counter: next },
        warnings: [],
      };
    }

    case SwitchMessageType.NrpnCoarse: {
      if (phase === "release") return empty();
      const [value, nrpnLsb, nrpnMsb] = data;
      return { ...empty(), messages: [cc(channel, 99, nrpnMsb), cc(channel, 98, nrpnLsb), cc(channel, 6, value)] };
    }

    case SwitchMessageType.NrpnFine: {
      if (phase === "release") return empty();
      const [value, nrpnLsb, nrpnMsb] = data;
      return { ...empty(), messages: [cc(channel, 99, nrpnMsb), cc(channel, 98, nrpnLsb), cc(channel, 38, value)] };
    }

    case SwitchMessageType.Mmc: {
      if (phase === "release") return empty();
      const [device, command] = data;
      return { ...empty(), messages: [mmc(device, command)] };
    }

    case SwitchMessageType.Relay: {
      if (phase === "release") return empty();
      const [mode, relayIndex] = data;
      return { ...empty(), deviceActions: [{ kind: "relay", relayIndex, mode }] };
    }

    case SwitchMessageType.PresetSelect: {
      if (phase === "release") return empty();
      const [target] = data;
      if (target === 1) return { ...empty(), deviceActions: [{ kind: "specialPreset", preset: "track" }] };
      if (target === 2) return { ...empty(), deviceActions: [{ kind: "specialPreset", preset: "transport" }] };
      const targetIndex = presetSelectTargetToIndex(target);
      if (targetIndex === undefined) {
        const label = PresetSelectTarget[target] ?? String(target);
        return warn(`PresetSelect target "${label}" isn't simulated yet`);
      }
      return { ...empty(), deviceActions: [{ kind: "presetJump", targetIndex }] };
    }

    case SwitchMessageType.PresetIncDec: {
      if (phase === "release") return empty();
      const [incDec] = data;
      return { ...empty(), deviceActions: [{ kind: "presetRelative", direction: incDec === 0 ? "next" : "prev" }] };
    }

    case SwitchMessageType.StepSelect:
    case SwitchMessageType.StepIncDec: {
      if (phase === "release") return empty();
      return warn("StepSelect/StepIncDec targeting isn't simulated yet (unverified target numbering) — no-op");
    }

    default:
      return warn(`unrecognized switch message type 0x${msgType.toString(16)}`);
  }
}

/**
 * Implements the ExpressionMessageType data-byte layout documented in the simulator plan.
 * Modeling a continuous pedal as digital press(=max)/release(=min) is a deliberate
 * simplification, not a hardware claim — see the plan's notes on expression pedal scope.
 */
export function fireExpressionStep(
  step: Step,
  phase: ControlPhase,
  _subState: StepSubState,
  /** The wire channel (0-15) to transmit on, already resolved from `step.channel` (see `wireChannel`). */
  channel: number,
): StepFireResult {
  const { msgType, data } = step;

  switch (msgType) {
    case ExpressionMessageType.Off:
      return empty();

    case ExpressionMessageType.MidiCc: {
      const [controller, min, max] = data;
      return { ...empty(), messages: [cc(channel, controller, phase === "press" ? max : min)] };
    }

    case ExpressionMessageType.PitchBend: {
      const [, min, max] = data;
      return { ...empty(), messages: [pitchBend(channel, phase === "press" ? max : min)] };
    }

    case ExpressionMessageType.ChannelAftertouch: {
      const [, min, max] = data;
      return { ...empty(), messages: [channelAftertouch(channel, phase === "press" ? max : min)] };
    }

    case ExpressionMessageType.NrpnCoarse: {
      if (phase === "release") return empty();
      const [max, nrpnLsb, nrpnMsb] = data;
      return { ...empty(), messages: [cc(channel, 99, nrpnMsb), cc(channel, 98, nrpnLsb), cc(channel, 6, max)] };
    }

    case ExpressionMessageType.NrpnFine: {
      if (phase === "release") return empty();
      const [max, nrpnLsb, nrpnMsb] = data;
      return { ...empty(), messages: [cc(channel, 99, nrpnMsb), cc(channel, 98, nrpnLsb), cc(channel, 38, max)] };
    }

    default:
      return warn(`unrecognized expression pedal message type 0x${msgType.toString(16)}`);
  }
}
