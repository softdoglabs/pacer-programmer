import { assign, raise, setup } from "xstate";
import { ControlId } from "../protocol/constants";
import type { SpecialPresetName } from "../simulator/types";
import { SPECIAL_PRESETS } from "./specialPresets";

/**
 * How long [Preset] must be held to enter preset select. The Pacer User Guide says "press and
 * hold for 2 seconds" / "until the LEDs for switches 1-6 blink" (the same wording in both
 * editions we found); nothing documents a shorter threshold. Adjust if hardware says otherwise.
 */
export const PRESET_HOLD_MS = 2000;

/**
 * The Pacer firmware's preset-level mode: which "preset" the 10 stompswitches currently belong
 * to. Two parallel regions:
 *
 * `mode`:
 * - `user`: one of the loaded config's presets (the board's `activePresetIndex`). Switch presses
 *   go to the simulation engine, not this machine.
 * - `presetSelect`, `track`, `transport`: firmware-owned special presets that aren't in the
 *   config. While one is active, the board still points at the last user preset: the
 *   remembered "last actual preset" that a [Preset] tap returns to.
 *
 * `presetButton`: turns raw [Preset] down/up into a *tap* (released before PRESET_HOLD_MS) or a
 * *hold* (fires as soon as the threshold passes, while still held, like the hardware's blinking
 * LEDs).
 *
 * Behavior:
 * - Hold: enter preset select, from any mode. A-D pick a bank; 1-6 load that number in the
 *   pending bank, which starts as the current preset's bank, so a bare 1-6 stays in the bank.
 *   (User Guide.)
 * - Tap: back to the last user preset. From Track/Transport this reloads it; from preset select
 *   it cancels; on a user preset it does nothing. (Observed hardware behavior; not in the guide.)
 * - A factory preset's A/B enter Track/Transport via PresetSelect's reserved targets, which the
 *   engine reports as `specialPresetRequested`.
 * - Assumption: reloading resets the user preset's runtime state (toggles, sequence positions).
 */
export type DeviceModeEvent =
  | { type: "PRESET_DOWN"; currentBank: number }
  | { type: "PRESET_UP" }
  | { type: "SWITCH"; controlId: number }
  | { type: "ENTER_SPECIAL"; preset: SpecialPresetName };

/** Raised internally by the `presetButton` region. */
type PresetGestureEvent = { type: "PRESET_TAP" } | { type: "PRESET_HOLD" };

const BANK_SWITCHES: readonly number[] = [
  ControlId.StompswitchA,
  ControlId.StompswitchB,
  ControlId.StompswitchC,
  ControlId.StompswitchD,
];

const NUMBER_SWITCHES: readonly number[] = [
  ControlId.Stompswitch1,
  ControlId.Stompswitch2,
  ControlId.Stompswitch3,
  ControlId.Stompswitch4,
  ControlId.Stompswitch5,
  ControlId.Stompswitch6,
];

/** The 10 built-in stompswitches: the only controls special presets define. */
export const STOMPSWITCH_IDS: readonly number[] = [...NUMBER_SWITCHES, ...BANK_SWITCHES];

function specialAction(preset: SpecialPresetName, controlId: number) {
  return SPECIAL_PRESETS[preset].switches[controlId]?.action;
}

function gotoTarget(preset: SpecialPresetName, controlId: number): SpecialPresetName | undefined {
  const action = specialAction(preset, controlId);
  return action?.kind === "goto" ? action.preset : undefined;
}

type SwitchEvent = { controlId: number };

function specialPresetState(name: SpecialPresetName) {
  return {
    on: {
      PRESET_TAP: { target: "#mode.user", actions: "returnToLastPreset" },
      SWITCH: [
        { guard: ({ event }: { event: SwitchEvent }) => gotoTarget(name, event.controlId) === "track", target: "#mode.track" },
        { guard: ({ event }: { event: SwitchEvent }) => gotoTarget(name, event.controlId) === "transport", target: "#mode.transport" },
        {
          guard: ({ event }: { event: SwitchEvent }) => specialAction(name, event.controlId)?.kind === "daw",
          actions: {
            type: "dawCommand",
            params: ({ event }: { event: SwitchEvent }) => {
              const action = specialAction(name, event.controlId);
              return { preset: name, command: action?.kind === "daw" ? action.command : "" };
            },
          },
        },
      ],
    },
  } as const;
}

export const deviceModeMachine = setup({
  types: {
    context: {} as { pendingBank: number; bankAtPress: number },
    events: {} as DeviceModeEvent | PresetGestureEvent,
  },
  delays: {
    presetHold: PRESET_HOLD_MS,
  },
  actions: {
    /** The following three are implemented by whoever runs the machine (the store), via `.provide()`. */
    loadPreset: (_, _params: { index: number }) => {},
    returnToLastPreset: () => {},
    dawCommand: (_, _params: { preset: SpecialPresetName; command: string }) => {},
  },
}).createMachine({
  id: "device",
  type: "parallel",
  context: { pendingBank: 0, bankAtPress: 0 },
  states: {
    mode: {
      id: "mode",
      initial: "user",
      // Hold enters preset select from anywhere, starting at the bank of the preset [Preset] was pressed on.
      on: {
        PRESET_HOLD: { target: ".presetSelect", actions: assign({ pendingBank: ({ context }) => context.bankAtPress }) },
      },
      states: {
        user: {
          on: {
            ENTER_SPECIAL: [
              { guard: ({ event }) => event.preset === "track", target: "track" },
              { guard: ({ event }) => event.preset === "transport", target: "transport" },
            ],
          },
        },
        presetSelect: {
          on: {
            // Cancel: nothing was loaded, so the user preset (and its runtime state) is simply still there.
            PRESET_TAP: { target: "user" },
            SWITCH: [
              {
                guard: ({ event }) => BANK_SWITCHES.includes(event.controlId),
                actions: assign({ pendingBank: ({ event }) => BANK_SWITCHES.indexOf(event.controlId) }),
              },
              {
                guard: ({ event }) => NUMBER_SWITCHES.includes(event.controlId),
                target: "user",
                actions: {
                  type: "loadPreset",
                  params: ({ context, event }) => ({ index: context.pendingBank * 6 + NUMBER_SWITCHES.indexOf(event.controlId) }),
                },
              },
            ],
          },
        },
        track: specialPresetState("track"),
        transport: specialPresetState("transport"),
      },
    },
    presetButton: {
      initial: "up",
      states: {
        up: {
          on: { PRESET_DOWN: { target: "down", actions: assign({ bankAtPress: ({ event }) => event.currentBank }) } },
        },
        down: {
          after: { presetHold: { target: "heldLong", actions: raise({ type: "PRESET_HOLD" }) } },
          on: { PRESET_UP: { target: "up", actions: raise({ type: "PRESET_TAP" }) } },
        },
        heldLong: {
          on: { PRESET_UP: { target: "up" } },
        },
      },
    },
  },
});

export type DeviceMode = "user" | "presetSelect" | SpecialPresetName;
