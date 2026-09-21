import type { DawCommand } from "../hardware";
import { ControlId } from "../protocol/constants";
import type { SpecialPresetName } from "../simulator/types";

/**
 * What a stompswitch does inside one of the firmware's built-in, read-only DAW presets
 * (Track / Transport, used with Nektar DAW Integration).
 */
export type SpecialSwitchAction =
  /** A DAW command. The actual MIDI it sends depends on the DAW integration (MCU by default, per the manual) and isn't modeled. */
  | { kind: "daw"; command: DawCommand }
  /** Switch to the other built-in DAW preset. */
  | { kind: "goto"; preset: SpecialPresetName };

export interface SpecialPresetDefinition {
  /** 5-character display text. Our own choice; what the real display shows isn't documented. */
  displayName: string;
  switches: Partial<Record<number, SpecialSwitchAction>>;
}

/*
 * Sources: the Pacer User Guide ("Pacer Functional Overview", "Factory Preset List", "Patch
 * Up/Down Function") plus the legends printed on the faceplate (see src/pacer/hardware). The
 * command names are the hardware table's DawCommand, so each assignment lights the legend that
 * depicts it: the Track preset lights the top text row, Transport the middle icon row.
 * Track: 1-4 = Solo / Mute / Rec Arm / Click, 5-6 = Patch down/up. Transport: 1-6 = Cycle /
 * Rewind / Forward / Stop / Play / Record. In both, C/D select the previous/next track.
 *
 * Assumption (not documented): A and B keep their faceplate roles inside these presets, so
 * A = Track and B = Transport switch between the two. Leaving them is done with [Preset],
 * which returns to the last user preset (see deviceModeMachine.ts).
 */
const SHARED: SpecialPresetDefinition["switches"] = {
  [ControlId.StompswitchA]: { kind: "goto", preset: "track" },
  [ControlId.StompswitchB]: { kind: "goto", preset: "transport" },
  [ControlId.StompswitchC]: { kind: "daw", command: "Previous track" },
  [ControlId.StompswitchD]: { kind: "daw", command: "Next track" },
};

function daw(command: DawCommand): SpecialSwitchAction {
  return { kind: "daw", command };
}

export const SPECIAL_PRESETS: Record<SpecialPresetName, SpecialPresetDefinition> = {
  track: {
    displayName: "TRACK",
    switches: {
      ...SHARED,
      [ControlId.Stompswitch1]: daw("Solo"),
      [ControlId.Stompswitch2]: daw("Mute"),
      [ControlId.Stompswitch3]: daw("Rec Arm"),
      [ControlId.Stompswitch4]: daw("Click"),
      [ControlId.Stompswitch5]: daw("Previous patch"),
      [ControlId.Stompswitch6]: daw("Next patch"),
    },
  },
  transport: {
    displayName: "TRANS",
    switches: {
      ...SHARED,
      [ControlId.Stompswitch1]: daw("Cycle"),
      [ControlId.Stompswitch2]: daw("Rewind"),
      [ControlId.Stompswitch3]: daw("Fast forward"),
      [ControlId.Stompswitch4]: daw("Stop"),
      [ControlId.Stompswitch5]: daw("Play"),
      [ControlId.Stompswitch6]: daw("Record"),
    },
  },
};
