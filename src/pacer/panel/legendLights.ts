import { SPECIAL_PRESETS, type DeviceMode } from "../device";
import type { DawCommand, LegendFunction, SwitchSpec } from "../hardware";
import { SwitchMessageType } from "../protocol/constants";
import type { SwitchControl } from "../protocol/types";
import { inkOrColor, type SwitchLights } from "./lights";

/*
 * Printed legends are function indicators: a legend lights while its switch is assigned the
 * function it depicts (`IndicatorSpec.depicts`). The same rule covers:
 * - the back row: A's "Track" lights only while A selects Track;
 * - the front row in the built-in DAW presets: the Track preset assigns Solo, Mute, ... so the
 *   top text row lights; Transport assigns Cycle, Rewind, ... so the middle icon row lights.
 */

/** DAW commands that are also previous/next navigation, depicted by C/D's arrows. */
const NAVIGATION_COMMANDS: Partial<Record<DawCommand, "previous" | "next">> = {
  "Previous track": "previous",
  "Next track": "next",
};

/** Functions a user preset's control is assigned, from its active steps. */
function userPresetFunctions(control: SwitchControl | undefined): LegendFunction[] {
  if (!control) return [];
  return Object.values(control.steps).flatMap((step): LegendFunction[] => {
    if (!step?.active) return [];
    switch (step.msgType) {
      case SwitchMessageType.PresetSelect:
        if (step.data[0] === 1) return [{ kind: "selectMode", mode: "track" }];
        if (step.data[0] === 2) return [{ kind: "selectMode", mode: "transport" }];
        return [];
      case SwitchMessageType.PresetIncDec:
        return [{ kind: "navigate", direction: step.data[0] === 0 ? "next" : "previous" }];
      default:
        return [];
    }
  });
}

/** Functions a switch is assigned inside a built-in DAW preset. */
function dawPresetFunctions(controlId: number, mode: "track" | "transport"): LegendFunction[] {
  const action = SPECIAL_PRESETS[mode].switches[controlId];
  if (!action) return [];
  if (action.kind === "goto") return [{ kind: "selectMode", mode: action.preset }];
  const direction = NAVIGATION_COMMANDS[action.command];
  return [
    { kind: "dawCommand", command: action.command },
    ...(direction ? [{ kind: "navigate", direction } as const] : []),
  ];
}

function sameFunction(a: LegendFunction, b: LegendFunction): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Lights for a switch's printed legends. In preset select, switches keep the underlying user
 * preset's assignments; whether the firmware changes legends there is unobserved.
 */
export function legendLights(spec: SwitchSpec, mode: DeviceMode, control: SwitchControl | undefined): SwitchLights {
  const assigned: LegendFunction[] =
    spec.kind === "presetSwitch"
      ? [{ kind: "presetButton" }]
      : spec.controlId === undefined
        ? []
        : mode === "track" || mode === "transport"
          ? dawPresetFunctions(spec.controlId, mode)
          : userPresetFunctions(control);

  const lights: SwitchLights = {};
  for (const indicator of spec.indicators) {
    const depicts = indicator.depicts;
    if (depicts && assigned.some((f) => sameFunction(f, depicts))) {
      lights[indicator.id] = {
        brightness: "bright",
        flashing: false,
        color: inkOrColor(indicator, { kind: "unspecified" }),
      };
    }
  }
  return lights;
}
