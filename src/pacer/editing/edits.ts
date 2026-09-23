import { ExpressionMessageType, STEPS_PER_CONTROL, SwitchMessageType, type ControlMode } from "../protocol/constants";
import type { LedConfig, PacerConfig, Preset, Step, SwitchControl } from "../protocol/types";

/*
 * Pure edit operations on a PacerConfig, used by the programming interface. Each returns a new
 * config, copying only the path it changes (config -> preset -> control -> step), so undo
 * history can hold previous configs cheaply and unchanged parts stay reference-equal.
 */

export type ControlKind = "switch" | "expressionPedal";

/** A preset name: up to 5 printable ASCII characters (the display's width), stored padded to 5 like the dumps. */
export const PRESET_NAME_LENGTH = 5;

/**
 * Characters every name in the factory dump and the owner's device uses. The display is a
 * 14-segment module, so anything outside this may not render as typed on the hardware.
 */
const KNOWN_NAME_CHARS = /^[A-Z0-9 -]*$/;

/**
 * The stored form of a typed name: printable ASCII only, uppercase (no dump has ever held a
 * lowercase name), truncated to the display's width and padded like the dumps.
 */
export function normalizePresetName(name: string): string {
  const printable = Array.from(name)
    .filter((c) => c >= " " && c <= "~")
    .join("")
    .toUpperCase();
  return printable.slice(0, PRESET_NAME_LENGTH).padEnd(PRESET_NAME_LENGTH, " ");
}

export interface PresetNameCheck {
  /** What would be stored (see `normalizePresetName`). */
  name: string;
  /** Set when the text can't be stored as typed: the edit should be refused. */
  error?: string;
  /** Set when it can be stored but the hardware may not show it as typed. */
  warning?: string;
}

/** Checks a typed preset name, separating what's impossible from what's merely unverified. */
export function checkPresetName(raw: string): PresetNameCheck {
  const name = normalizePresetName(raw);
  const chars = Array.from(raw);
  if (chars.length > PRESET_NAME_LENGTH) {
    return { name, error: `Up to ${PRESET_NAME_LENGTH} characters (the display's width)` };
  }
  if (chars.some((c) => c < " " || c > "~")) {
    return { name, error: "Only printable ASCII characters can be stored" };
  }
  const unknown = Array.from(new Set(Array.from(name).filter((c) => !KNOWN_NAME_CHARS.test(c))));
  if (unknown.length > 0) {
    return {
      name,
      warning: `The Pacer may not display ${unknown.join(" ")} — its own names use A-Z, 0-9, space and -`,
    };
  }
  return { name };
}

function emptyPreset(index: number): Preset {
  return { index, controls: {}, midiSettings: {} };
}

function withPreset(config: PacerConfig, presetIndex: number, update: (preset: Preset) => Preset): PacerConfig {
  const preset = config.presets[presetIndex] ?? emptyPreset(presetIndex);
  return { ...config, presets: { ...config.presets, [presetIndex]: update(preset) } };
}

function withControl(
  config: PacerConfig,
  presetIndex: number,
  controlId: number,
  update: (control: SwitchControl) => SwitchControl,
): PacerConfig {
  return withPreset(config, presetIndex, (preset) => {
    const control = preset.controls[controlId] ?? { steps: {}, led: {} };
    return { ...preset, controls: { ...preset.controls, [controlId]: update(control) } };
  });
}

const EMPTY_STEP: Step = { channel: 0, msgType: SwitchMessageType.Off, data: [0, 0, 0], active: false };

function isValidStepNumber(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= STEPS_PER_CONTROL;
}

export function renamePreset(config: PacerConfig, presetIndex: number, name: string): PacerConfig {
  return withPreset(config, presetIndex, (preset) => ({ ...preset, name: normalizePresetName(name) }));
}

export function setControlMode(config: PacerConfig, presetIndex: number, controlId: number, mode: ControlMode) {
  return withControl(config, presetIndex, controlId, (control) => ({ ...control, controlMode: mode }));
}

/**
 * Patches one step's fields. Step 1 can't be deactivated: the User Guide says every control
 * needs at least one step, and the hardware menu refuses it.
 */
export function updateStep(
  config: PacerConfig,
  presetIndex: number,
  controlId: number,
  stepNumber: number,
  patch: Partial<Step>,
): PacerConfig {
  if (!isValidStepNumber(stepNumber)) throw new RangeError(`step ${stepNumber} out of range`);
  const clamped: Partial<Step> = { ...patch };
  if (stepNumber === 1 && clamped.active === false) delete clamped.active;
  if (clamped.data) clamped.data = clamped.data.map((v) => Math.max(0, Math.min(127, Math.round(v)))) as Step["data"];
  if (clamped.channel !== undefined) clamped.channel = Math.max(0, Math.min(16, Math.round(clamped.channel)));
  return withControl(config, presetIndex, controlId, (control) => ({
    ...control,
    steps: { ...control.steps, [stepNumber]: { ...(control.steps[stepNumber] ?? EMPTY_STEP), ...clamped } },
  }));
}

/** Sensible starting data when a step switches to a message type (the user edits from there). */
function defaultData(kind: ControlKind, msgType: number, previous: Step | undefined): Step["data"] {
  const keepController = previous?.data[0] ?? 0;
  if (kind === "expressionPedal") {
    switch (msgType) {
      case ExpressionMessageType.MidiCc:
        return [7, 0, 127];
      case ExpressionMessageType.PitchBend:
      case ExpressionMessageType.ChannelAftertouch:
        return [0, 0, 127];
      default:
        return [0, 0, 0];
    }
  }
  switch (msgType) {
    case SwitchMessageType.CcTrigger:
      return [keepController, 127, 0];
    case SwitchMessageType.CcToggle:
    case SwitchMessageType.CcStep:
      return [keepController, 0, 127];
    case SwitchMessageType.Note:
    case SwitchMessageType.NoteToggle:
      return [60, 100, 0];
    case SwitchMessageType.ProgramStep:
      return [0, 0, 127];
    case SwitchMessageType.Mmc:
      return [127, 2, 0]; // all devices, Play
    case SwitchMessageType.PresetSelect:
      return [3, 0, 0]; // A1
    default:
      return [0, 0, 0];
  }
}

/**
 * Changes a step's message type, resetting its data to that type's defaults (keeping the
 * controller number across CC types). Choosing any type other than Off also turns the step on,
 * since picking a type means you want it to fire.
 */
export function setStepType(
  config: PacerConfig,
  presetIndex: number,
  controlId: number,
  stepNumber: number,
  kind: ControlKind,
  msgType: number,
): PacerConfig {
  const previous = config.presets[presetIndex]?.controls[controlId]?.steps[stepNumber];
  const off = kind === "switch" ? SwitchMessageType.Off : ExpressionMessageType.Off;
  return updateStep(config, presetIndex, controlId, stepNumber, {
    msgType,
    data: defaultData(kind, msgType, previous),
    ...(msgType !== off ? { active: true } : {}),
  });
}

const DEFAULT_LED: LedConfig = { midiFeedback: 0, activeColor: 0x7f, inactiveColor: 0x7f, position: 0 };

/** Patches a step's LED config (colors are Pacer color codes; `position` is the LED num). */
export function updateStepLed(
  config: PacerConfig,
  presetIndex: number,
  controlId: number,
  stepNumber: number,
  patch: Partial<LedConfig>,
): PacerConfig {
  if (!isValidStepNumber(stepNumber)) throw new RangeError(`step ${stepNumber} out of range`);
  return withControl(config, presetIndex, controlId, (control) => ({
    ...control,
    led: { ...control.led, [stepNumber]: { ...DEFAULT_LED, ...control.led[stepNumber], ...patch } },
  }));
}
