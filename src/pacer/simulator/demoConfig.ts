import { ControlId, ControlMode, SwitchMessageType } from "../protocol/constants";
import { createEmptyPacerConfig, getOrCreateControl, getOrCreatePreset, type PacerConfig } from "../protocol/types";

function step(msgType: number, data: [number, number, number]) {
  return { channel: 0, msgType, data, active: true };
}

/**
 * A small hand-authored config (not derived from the factory fixture) built to be interesting
 * to click through in the placeholder UI: a control mixing a momentary CC trigger with a
 * persistent CC toggle, a Sequence-mode control cycling through 3 CC steps, and a miniature
 * version of CLAUDE.md's looper pattern (a Program Change + PresetSelect pair jumping A1 -> B1
 * and back), to make preset-jump and runtime-reset behavior visible.
 */
export function buildDemoConfig(): PacerConfig {
  const config = createEmptyPacerConfig();

  const a1 = getOrCreatePreset(config, 0);
  a1.name = "DEMO A1";

  const triggerAndToggle = getOrCreateControl(a1, ControlId.Stompswitch1);
  triggerAndToggle.steps[1] = step(SwitchMessageType.CcTrigger, [20, 127, 0]);
  triggerAndToggle.steps[2] = step(SwitchMessageType.CcToggle, [21, 0, 127]);

  const sequenced = getOrCreateControl(a1, ControlId.Stompswitch2);
  sequenced.controlMode = ControlMode.Sequence;
  sequenced.steps[1] = step(SwitchMessageType.CcTrigger, [30, 127, 0]);
  sequenced.steps[2] = step(SwitchMessageType.CcTrigger, [31, 127, 0]);
  sequenced.steps[3] = step(SwitchMessageType.CcTrigger, [32, 127, 0]);

  const looperOn = getOrCreateControl(a1, ControlId.StompswitchA);
  looperOn.steps[1] = step(SwitchMessageType.ProgramAndBank, [5, 0, 0]); // activate Quad Cortex looper
  looperOn.steps[2] = step(SwitchMessageType.PresetSelect, [6 + 3, 0, 0]); // jump to B1 (idx 6)

  const b1 = getOrCreatePreset(config, 6);
  b1.name = "DEMO B1";

  const looperOff = getOrCreateControl(b1, ControlId.StompswitchA);
  looperOff.steps[1] = step(SwitchMessageType.ProgramAndBank, [6, 0, 0]); // deactivate looper
  looperOff.steps[2] = step(SwitchMessageType.PresetSelect, [0 + 3, 0, 0]); // jump back to A1 (idx 0)

  return config;
}
