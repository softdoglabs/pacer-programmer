// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { NumberField } from "@/components/ui/number-field";
import { Select, type SelectGroup } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { setStepType, updateStep, updateStepLed, type ControlKind } from "../../pacer/editing";
import { indicatorForLedNum, type SwitchSpec } from "../../pacer/hardware";
import {
  ControlMode,
  ExpressionMessageType,
  MIDI_CHANNEL_CHOICES,
  LED_MIDI_FEEDBACK_OFF,
  LED_MIDI_FEEDBACK_ON,
  PresetSelectTarget,
  SwitchMessageType,
  presetIndexToLabel,
} from "../../pacer/protocol/constants";
import { LED_COLOR_DEFAULT } from "../../pacer/protocol/ledColors";
import type { LedConfig, Step } from "../../pacer/protocol/types";
import { messageTypeInfo } from "../../pacer/simulator";
import { usePacerStore } from "../../store/pacerStore";
import { LedColorPicker } from "./LedColorPicker";

const SWITCH_TYPE_GROUPS: { title: string; types: number[] }[] = [
  {
    title: "Send MIDI",
    types: [
      SwitchMessageType.ProgramAndBank,
      SwitchMessageType.ProgramStep,
      SwitchMessageType.CcTrigger,
      SwitchMessageType.CcToggle,
      SwitchMessageType.CcStep,
      SwitchMessageType.Note,
      SwitchMessageType.NoteToggle,
      SwitchMessageType.NrpnCoarse,
      SwitchMessageType.NrpnFine,
      SwitchMessageType.Mmc,
    ],
  },
  {
    title: "Pacer actions",
    types: [
      SwitchMessageType.PresetSelect,
      SwitchMessageType.PresetIncDec,
      SwitchMessageType.Relay,
      SwitchMessageType.StepSelect,
      SwitchMessageType.StepIncDec,
    ],
  },
  { title: "Nothing", types: [SwitchMessageType.Off] },
];

const EXPRESSION_TYPE_GROUPS: { title: string; types: number[] }[] = [
  {
    title: "Send MIDI",
    types: [
      ExpressionMessageType.MidiCc,
      ExpressionMessageType.PitchBend,
      ExpressionMessageType.ChannelAftertouch,
      ExpressionMessageType.NrpnCoarse,
      ExpressionMessageType.NrpnFine,
    ],
  },
  { title: "Nothing", types: [ExpressionMessageType.Off] },
];

/** Switch step types that don't transmit on a MIDI channel. */
const NO_CHANNEL: readonly number[] = [
  SwitchMessageType.PresetSelect,
  SwitchMessageType.PresetIncDec,
  SwitchMessageType.Relay,
  SwitchMessageType.StepSelect,
  SwitchMessageType.StepIncDec,
  SwitchMessageType.Mmc,
  SwitchMessageType.Off,
];

const PRESET_TARGET_OPTIONS: SelectGroup[] = [
  {
    title: "Built-in",
    options: [
      { id: "1", label: "Track (DAW)" },
      { id: "2", label: "Transport (DAW)" },
    ],
  },
  {
    title: "User presets",
    options: PresetSelectTarget.slice(3).map((label, i) => ({ id: String(i + 3), label })),
  },
];

/** Step types that send a MIDI CC — the only ones the LED's MIDI feedback flag acts on. */
const CC_TYPES: readonly number[] = [SwitchMessageType.CcTrigger, SwitchMessageType.CcToggle, SwitchMessageType.CcStep];

const LED_TARGET_NAMES = { bar: "Bar", text: "Text legend", icons: "Icon legend" } as const;

function typeOptions(kind: ControlKind): SelectGroup[] {
  const groups = kind === "switch" ? SWITCH_TYPE_GROUPS : EXPRESSION_TYPE_GROUPS;
  return groups.map((g) => ({
    title: g.title,
    options: g.types.map((t) => ({ id: String(t), label: messageTypeInfo(kind, t).name })),
  }));
}

function DataFields({ kind, step, onData }: { kind: ControlKind; step: Step; onData: (data: Step["data"]) => void }) {
  const set = (i: number, v: number) => {
    const data = [...step.data] as Step["data"];
    data[i] = v;
    onData(data);
  };
  if (kind === "switch" && step.msgType === SwitchMessageType.PresetSelect) {
    return (
      <Select
        label="Jump to"
        title="The preset this step loads when the control fires"
        options={PRESET_TARGET_OPTIONS}
        value={String(step.data[0])}
        onChange={(v) => v && set(0, Number(v))}
      />
    );
  }
  if (kind === "switch" && step.msgType === SwitchMessageType.PresetIncDec) {
    return (
      <ToggleGroup
        label="Direction"
        options={[
          { id: "0", label: "Next preset", title: "Step forward through the presets, wrapping at D6" },
          { id: "1", label: "Previous preset", title: "Step back through the presets, wrapping at A1" },
        ]}
        value={step.data[0] === 0 ? "0" : "1"}
        onChange={(v) => set(0, Number(v))}
      />
    );
  }
  const { dataFields } = messageTypeInfo(kind, step.msgType);
  return (
    <div className="flex flex-wrap gap-3">
      {dataFields.map((field, i) =>
        field === undefined ? null : (
          <NumberField key={i} label={field} value={step.data[i]!} onChange={(v) => set(i, v)} />
        ),
      )}
    </div>
  );
}

/**
 * What each of a step's two colors means. The firmware shows the first while the step's MIDI
 * matches its own data (for a CC step: while the controller holds data[1]), the second otherwise
 * — so "On/Off" only reads correctly when the pressed value sits in data[1]. See CLAUDE.md's LED
 * model.
 */
function colorLabels(kind: ControlKind, step: Step): [string, string] {
  if (kind !== "switch") return ["Color", "Second color"];
  switch (step.msgType) {
    case SwitchMessageType.CcToggle:
    case SwitchMessageType.CcTrigger:
      return [`While CC ${step.data[0]} = ${step.data[1]}`, "Otherwise"];
    case SwitchMessageType.Note:
    case SwitchMessageType.NoteToggle:
      return ["While the note is on", "Otherwise"];
    case SwitchMessageType.ProgramAndBank:
      return ["While this program is active", "Otherwise"];
    case SwitchMessageType.PresetSelect:
      return ["Color", "Unused: this type always shows the first color"];
    default:
      return ["On color", "Off color"];
  }
}

function LedFields({
  spec,
  kind,
  step,
  led,
  onLed,
}: {
  spec: SwitchSpec;
  kind: ControlKind;
  step: Step;
  led: LedConfig | undefined;
  onLed: (patch: Partial<LedConfig>) => void;
}) {
  const [firstLabel, secondLabel] = colorLabels(kind, step);
  // LED nums 0 and 1 both light the bar, and a switch has no light for some nums at all
  // (A-D have nothing on 3), so offer one option per light the switch really has.
  const seen = new Set<string>();
  const targets = [0, 1, 2, 3].flatMap((num) => {
    const indicator = indicatorForLedNum(spec, num);
    if (!indicator || seen.has(indicator.id)) return [];
    seen.add(indicator.id);
    return [
      {
        id: String(num),
        label: LED_TARGET_NAMES[indicator.face.kind],
        title: `Light this step's colors on the switch's ${LED_TARGET_NAMES[
          indicator.face.kind
        ].toLowerCase()} (LED num ${num})`,
      },
    ];
  });
  // A config using num 1 (the bar) selects the same option as num 0.
  const selected = indicatorForLedNum(spec, led?.position ?? 0);
  const value = targets.find((t) => indicatorForLedNum(spec, Number(t.id))?.id === selected?.id)?.id ?? "0";
  const followsMidi = (led?.midiFeedback ?? LED_MIDI_FEEDBACK_OFF) !== LED_MIDI_FEEDBACK_OFF;
  // MIDI feedback is a CC feature: a Program Change step with the flag on didn't respond on 1.01.12.
  const sendsCc = kind === "switch" ? CC_TYPES.includes(step.msgType) : step.msgType === ExpressionMessageType.MidiCc;
  return (
    <div className="space-y-2 border-t pt-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <ToggleGroup
          label="Light"
          labelVisible
          options={targets}
          value={value}
          onChange={(v) => onLed({ position: Number(v) })}
        />
        <ToggleGroup
          label="Lit by"
          labelVisible
          options={[
            { id: "switch", label: "This switch", title: "The light follows what this switch itself sends" },
            {
              id: "midi",
              label: "Incoming MIDI",
              title: "The light follows this step's CC arriving over USB, and stops following presses",
            },
          ]}
          value={followsMidi ? "midi" : "switch"}
          onChange={(v) => onLed({ midiFeedback: v === "midi" ? LED_MIDI_FEEDBACK_ON : LED_MIDI_FEEDBACK_OFF })}
        />
      </div>
      {followsMidi && (
        <p className="text-xs text-muted-foreground">
          {sendsCc
            ? `Lit by CC ${step.data[0]} received over USB; pressing the switch no longer changes it. Needs something echoing that CC back, since the Pacer has no MIDI In jack. With nothing received it stays on the second color, as drawn here. Verified on hardware.`
            : "This only works on CC steps, so it will have no effect here. Verified on hardware."}
        </p>
      )}
      <div className="flex flex-wrap gap-4">
        <LedColorPicker
          label={firstLabel}
          value={led?.activeColor ?? LED_COLOR_DEFAULT}
          onChange={(activeColor) => onLed({ activeColor })}
        />
        <LedColorPicker
          label={secondLabel}
          value={led?.inactiveColor ?? LED_COLOR_DEFAULT}
          onChange={(inactiveColor) => onLed({ inactiveColor })}
        />
      </div>
    </div>
  );
}

/** One configured step of a control: its type, data, and (for lit switches) its LED. Steps after the first can be removed. */
export function StepCard({
  presetIndex,
  controlId,
  kind,
  spec,
  n,
  step,
  led,
  drivesLight,
  mode,
  copies,
}: {
  presetIndex: number;
  controlId: number;
  kind: ControlKind;
  spec: SwitchSpec | undefined;
  n: number;
  step: Step | undefined;
  led: LedConfig | undefined;
  /** Whether this is the step whose LED config the switch is showing (see `showingStep`). */
  drivesLight: boolean;
  mode: ControlMode;
  /** How many presets the state being edited is, so a jump can say why it isn't shared. */
  copies: number;
}) {
  const applyPresetEdit = usePacerStore((s) => s.applyPresetEdit);
  const applyEdit = usePacerStore((s) => s.applyEdit);
  const hasLights = kind === "switch" && spec !== undefined && spec.indicators.some((i) => i.addressable);

  /*
   * Where a jump goes is the one thing the presets of a state are allowed to differ on — it's the
   * return address, and the only thing that tells the copies apart (see `analysis/states.ts`). So
   * it's written to the preset in front of you, while everything else about the step goes to all
   * of them. Fanning this out would point every copy at the same place, which is how a state stops
   * coming back.
   */
  const navigates =
    kind === "switch" &&
    step !== undefined &&
    (step.msgType === SwitchMessageType.PresetSelect || step.msgType === SwitchMessageType.PresetIncDec);
  const editData = (data: Step["data"]) =>
    navigates
      ? applyEdit((c) => updateStep(c, presetIndex, controlId, n, { data }))
      : applyPresetEdit((c, i) => updateStep(c, i, controlId, n, { data }));

  return (
    <section aria-label={`Step ${n}`} className="space-y-3 rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Step {n}</span>
        {drivesLight && hasLights && <Badge variant="outline">lights the switch</Badge>}
        <Select
          label={`Step ${n} type`}
          title={`What step ${n} sends or does`}
          labelVisible={false}
          options={typeOptions(kind)}
          value={step ? String(step.msgType) : undefined}
          placeholder="Choose…"
          onChange={(v) => v && applyPresetEdit((c, i) => setStepType(c, i, controlId, n, kind, Number(v)))}
        />
        {step && !(kind === "switch" && NO_CHANNEL.includes(step.msgType)) && (
          <Select
            label="Channel"
            title="MIDI channel this step transmits on. Global follows the configuration's own channel."
            options={MIDI_CHANNEL_CHOICES}
            value={String(step.channel)}
            onChange={(v) => v && applyPresetEdit((c, i) => updateStep(c, i, controlId, n, { channel: Number(v) }))}
          />
        )}
        {n > 1 && (
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto"
            aria-label={`Remove step ${n}`}
            title={`Turn off step ${n}`}
            onPress={() => applyPresetEdit((c, i) => updateStep(c, i, controlId, n, { active: false }))}
          >
            ✕
          </Button>
        )}
      </div>
      {step && (
        <>
          {navigates && copies > 1 && (
            <p className="text-xs text-muted-foreground">
              Where this goes is what tells the {copies} presets of this state apart, so it changes on{" "}
              {presetIndexToLabel(presetIndex)} alone. The map changes them together.
            </p>
          )}
          <DataFields kind={kind} step={step} onData={editData} />
          {hasLights && (
            <>
              {!drivesLight && (
                <p className="border-t pt-2 text-xs text-muted-foreground">
                  {mode === ControlMode.Sequence
                    ? "Shows while this step is the next to fire."
                    : "Not shown: a switch lights one step at a time, and in All-at-once mode that's the first step."}
                </p>
              )}
              <LedFields
                spec={spec}
                kind={kind}
                step={step}
                led={led}
                onLed={(patch) => applyPresetEdit((c, i) => updateStepLed(c, i, controlId, n, patch))}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
