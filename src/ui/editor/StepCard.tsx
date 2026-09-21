import { NumberField } from "@/components/ui/number-field";
import { Select, type SelectGroup } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { setStepType, updateStep, updateStepLed, type ControlKind } from "../../pacer/editing";
import { indicatorForLedNum, type SwitchSpec } from "../../pacer/hardware";
import { ExpressionMessageType, PresetSelectTarget, SwitchMessageType } from "../../pacer/protocol/constants";
import type { LedConfig, Step } from "../../pacer/protocol/types";
import { messageTypeInfo } from "../../pacer/simulator";
import { usePacerStore } from "../../store/pacerStore";
import { SwatchPicker } from "./SwatchPicker";

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

const CHANNEL_OPTIONS = [
  { id: "0", label: "Global" },
  ...Array.from({ length: 16 }, (_, i) => ({ id: String(i + 1), label: String(i + 1) })),
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

const LED_TARGET_NAMES = { bar: "Bar", text: "Text row", icons: "Icon row" } as const;

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
          { id: "0", label: "Next preset" },
          { id: "1", label: "Previous preset" },
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

function LedFields({
  spec,
  led,
  onLed,
}: {
  spec: SwitchSpec;
  led: LedConfig | undefined;
  onLed: (patch: Partial<LedConfig>) => void;
}) {
  const defaultIndicator = indicatorForLedNum(spec, 0);
  const targets = [
    { id: "0", label: `Default${defaultIndicator ? ` (${LED_TARGET_NAMES[defaultIndicator.face.kind]})` : ""}` },
    ...[1, 2, 3].flatMap((num) => {
      const indicator = indicatorForLedNum(spec, num);
      return indicator ? [{ id: String(num), label: LED_TARGET_NAMES[indicator.face.kind] }] : [];
    }),
  ];
  return (
    <div className="space-y-2 border-t pt-2">
      <ToggleGroup
        label="Light"
        options={targets}
        value={String(led?.position ?? 0)}
        onChange={(v) => onLed({ position: Number(v) })}
      />
      <SwatchPicker
        label="On color"
        value={led?.activeColor ?? 0x7f}
        onChange={(activeColor) => onLed({ activeColor })}
      />
      <SwatchPicker
        label="Off color"
        value={led?.inactiveColor ?? 0x7f}
        onChange={(inactiveColor) => onLed({ inactiveColor })}
      />
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
}: {
  presetIndex: number;
  controlId: number;
  kind: ControlKind;
  spec: SwitchSpec | undefined;
  n: number;
  step: Step | undefined;
  led: LedConfig | undefined;
}) {
  const applyEdit = usePacerStore((s) => s.applyEdit);
  const hasLights = kind === "switch" && spec !== undefined && spec.indicators.some((i) => i.addressable);

  return (
    <section aria-label={`Step ${n}`} className="space-y-3 rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Step {n}</span>
        <Select
          label={`Step ${n} type`}
          labelVisible={false}
          options={typeOptions(kind)}
          value={step ? String(step.msgType) : undefined}
          placeholder="Choose…"
          onChange={(v) => v && applyEdit((c) => setStepType(c, presetIndex, controlId, n, kind, Number(v)))}
        />
        {step && !(kind === "switch" && NO_CHANNEL.includes(step.msgType)) && (
          <Select
            label="Channel"
            options={CHANNEL_OPTIONS}
            value={String(step.channel)}
            onChange={(v) => v && applyEdit((c) => updateStep(c, presetIndex, controlId, n, { channel: Number(v) }))}
          />
        )}
        {n > 1 && (
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto"
            aria-label={`Remove step ${n}`}
            onPress={() => applyEdit((c) => updateStep(c, presetIndex, controlId, n, { active: false }))}
          >
            ✕
          </Button>
        )}
      </div>
      {step && (
        <>
          <DataFields
            kind={kind}
            step={step}
            onData={(data) => applyEdit((c) => updateStep(c, presetIndex, controlId, n, { data }))}
          />
          {hasLights && (
            <LedFields
              spec={spec}
              led={led}
              onLed={(patch) => applyEdit((c) => updateStepLed(c, presetIndex, controlId, n, patch))}
            />
          )}
        </>
      )}
    </section>
  );
}
