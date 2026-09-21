import type { ControlId } from "../protocol/constants";

/**
 * Declarative description of the Pacer's physical controls: what each one *has* (lights,
 * printed legends, where it sits), independent of any preset config or runtime state. See
 * `pacerHardware.ts` for the instance and `src/pacer/panel/` for what's lit at any moment.
 */

/** Position of an independently driven light within a switch. Matches the SysEx "LED num" names. */
export type IndicatorId = "top" | "middle" | "bottom";

/** A step's SysEx "LED num" value: 0 = Default, 1 = Bottom, 2 = Middle, 3 = Top. */
export type LedNum = 0 | 1 | 2 | 3;

/** Ink of a fixed-color printed legend. */
export type InkColor = "white" | "red" | "orange" | "yellow" | "green" | "blue";

export type IconId = "loop" | "rewind" | "fastForward" | "stop" | "play" | "record" | "arrowUp" | "arrowDown";

/** What a light illuminates: an RGB light bar, a printed text legend, or printed icons. */
export type IndicatorFace =
  { kind: "bar" } | { kind: "text"; text: string } | { kind: "icons"; icons: readonly IconId[] };

/** The DAW functions printed on the front-row legends (and assigned by the built-in Track/Transport presets). */
export type DawCommand =
  | "Solo"
  | "Mute"
  | "Rec Arm"
  | "Click"
  | "Previous patch"
  | "Next patch"
  | "Cycle"
  | "Rewind"
  | "Fast forward"
  | "Stop"
  | "Play"
  | "Record"
  | "Previous track"
  | "Next track";

/**
 * The function a printed legend depicts. A legend lights while its switch is assigned that
 * function. User Guide: "When DAW Transport or Track functions are assigned, the top and middle
 * row icons are illuminated". Observed: A's "Track" legend is dark on presets where A was
 * reprogrammed away from selecting Track, and lit where it wasn't.
 */
export type LegendFunction =
  /** [Preset]: the firmware's own, non-programmable switch, so always assigned. */
  | { kind: "presetButton" }
  /** Selecting the built-in Track or Transport preset. */
  | { kind: "selectMode"; mode: "track" | "transport" }
  /** Stepping to the previous/next preset (user presets) or track (DAW presets). */
  | { kind: "navigate"; direction: "previous" | "next" }
  | { kind: "dawCommand"; command: DawCommand };

/** Whether a light's color is set by config (Pacer color codes) or fixed by its printed ink. */
export type IndicatorColor = { kind: "variable" } | { kind: "fixed"; ink: InkColor };

/** One piece of evidence behind a hardware fact, so unverified facts are easy to find and revisit. */
export type Evidence = { kind: "confirmed"; source: string } | { kind: "inferred"; reason: string };

export interface IndicatorSpec {
  id: IndicatorId;
  color: IndicatorColor;
  face: IndicatorFace;
  /** Whether a step's LED num can address this light at all. */
  addressable: boolean;
  /** For printed legends: the function it depicts, which lights it while assigned. Absent for bars. */
  depicts?: LegendFunction;
  /** What each aspect of this spec rests on. Any "inferred" entry means some of it is unverified. */
  evidence: readonly Evidence[];
}

export type PhysicalSwitchId =
  | "preset"
  | "swA"
  | "swB"
  | "swC"
  | "swD"
  | "sw1"
  | "sw2"
  | "sw3"
  | "sw4"
  | "sw5"
  | "sw6"
  | "fs1"
  | "fs2"
  | "fs3"
  | "fs4"
  | "exp1"
  | "exp2";

export type SwitchKind = "presetSwitch" | "stompswitch" | "externalFootswitch" | "expressionPedal";

/** A switch's job in the firmware's preset select mode. */
export type SelectRole = { kind: "bank"; bank: 0 | 1 | 2 | 3 } | { kind: "number"; num: 1 | 2 | 3 | 4 | 5 | 6 };

export type Placement = { kind: "panel"; row: "back" | "front"; col: number } | { kind: "rear"; order: number };

export interface SwitchSpec {
  id: PhysicalSwitchId;
  kind: SwitchKind;
  /** Short printed/UI name: "Preset", "A", "1", "FS1", "EXP1". */
  name: string;
  /** The programmable control this switch is, in preset configs. Absent for [Preset], which isn't programmable. */
  controlId?: ControlId;
  selectRole?: SelectRole;
  /** Top to bottom. Empty for controls with no lights (external footswitches, expression pedals). */
  indicators: readonly IndicatorSpec[];
  /** Which indicator a step's LED num 0 ("Default") drives. */
  defaultIndicator?: IndicatorId;
  /** Marking printed on the faceplate below the switch: a teal badge (A-D) or a plain numeral (1-6). */
  marking?: "badge" | "numeral";
  placement: Placement;
}
