import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ControlMode, STEPS_PER_CONTROL, presetIndexToLabel } from "../pacer/protocol/constants";
import type { LedConfig, Preset, Step, SwitchControl } from "../pacer/protocol/types";
import {
  controlKindOf,
  controlLabel,
  getControlDisplayState,
  getControlLedState,
  ledColor,
  messageTypeInfo,
  presetMidiTypeName,
  type ControlKind,
} from "../pacer/simulator";
import type { DeviceMode } from "../pacer/device";
import { usePacerStore } from "../store/pacerStore";

const MODE_NAMES: Record<number, string> = {
  [ControlMode.AllStepsAtOnce]: "All steps at once",
  [ControlMode.Sequence]: "Sequence",
  [ControlMode.ExternalStepSelect]: "External step select",
};

function LedSwatch({ code, label }: { code?: number; label: string }) {
  if (code === undefined) return <span className="text-muted-foreground">·</span>;
  const color = ledColor(code);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-block size-3.5 rounded-full border border-white/20 align-middle"
          style={{ background: color.css }}
          aria-label={`${label}: ${color.name}`}
        />
      </TooltipTrigger>
      <TooltipContent>
        {label}: {color.name}
      </TooltipContent>
    </Tooltip>
  );
}

function DataCells({ step, kind }: { step: Step; kind: ControlKind }) {
  const { dataFields } = messageTypeInfo(kind, step.msgType);
  return (
    <>
      {step.data.map((value, i) => (
        <td key={i} className="px-1.5 py-1 whitespace-nowrap tabular-nums">
          {dataFields[i] === undefined ? (
            <span className="text-muted-foreground/50">{value}</span>
          ) : (
            <span title={dataFields[i]}>
              <span className="text-[10px] text-muted-foreground">{dataFields[i]} </span>
              {value}
            </span>
          )}
        </td>
      ))}
    </>
  );
}

function StepRow({
  n,
  step,
  led,
  kind,
  current,
}: {
  n: number;
  step?: Step;
  led?: LedConfig;
  kind: ControlKind;
  current: boolean;
}) {
  return (
    <tr className={cn("border-t", current && "bg-primary/10", !step?.active && "text-muted-foreground")}>
      <td className="px-1.5 py-1 font-semibold tabular-nums">
        {n}
        {current && <span className="ml-1 text-primary">◂</span>}
      </td>
      <td className="px-1.5 py-1">{step ? (step.active ? "on" : "off") : "—"}</td>
      <td className="px-1.5 py-1 whitespace-nowrap">{step ? messageTypeInfo(kind, step.msgType).name : "—"}</td>
      <td className="px-1.5 py-1 tabular-nums">{step ? step.channel + 1 : ""}</td>
      {step ? <DataCells step={step} kind={kind} /> : <td colSpan={3} />}
      {kind === "switch" && (
        <td className="space-x-1 px-1.5 py-1 whitespace-nowrap">
          <LedSwatch code={led?.activeColor} label="Active" />
          <LedSwatch code={led?.inactiveColor} label="Inactive" />
        </td>
      )}
    </tr>
  );
}

function ControlDetails({ controlId, control }: { controlId: number; control: SwitchControl }) {
  const board = usePacerStore((s) => s.board);
  const kind = controlKindOf(controlId) ?? "switch";
  const display = getControlDisplayState(board, controlId);
  const led = getControlLedState(board, controlId);
  const mode = control.controlMode ?? ControlMode.AllStepsAtOnce;
  const hasLeds = Object.keys(control.led).length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{MODE_NAMES[mode] ?? `Mode 0x${mode.toString(16)}`}</Badge>
        {display.pressed && <Badge>held</Badge>}
        {display.activeToggleSteps.length > 0 && (
          <Badge variant="outline">toggled on: step {display.activeToggleSteps.join(", ")}</Badge>
        )}
        {mode === ControlMode.ExternalStepSelect && (
          <span className="text-xs text-warning">
            Simulated as always firing step 1 (cross-control step targeting not modeled yet).
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="px-1.5 py-1 font-medium">Step</th>
              <th className="px-1.5 py-1 font-medium">Active</th>
              <th className="px-1.5 py-1 font-medium">Type</th>
              <th className="px-1.5 py-1 font-medium">Ch</th>
              <th className="px-1.5 py-1 font-medium" colSpan={3}>
                Data
              </th>
              {kind === "switch" && <th className="px-1.5 py-1 font-medium">LED</th>}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: STEPS_PER_CONTROL }, (_, i) => i + 1).map((n) => (
              <StepRow
                key={n}
                n={n}
                step={control.steps[n]}
                led={control.led[n]}
                kind={kind}
                current={mode === ControlMode.Sequence ? display.sequencePointer === n : false}
              />
            ))}
          </tbody>
        </table>
      </div>
      {mode === ControlMode.Sequence && (
        <p className="text-xs text-muted-foreground">◂ marks the step the next press fires.</p>
      )}
      {hasLeds && led && (
        <p className="text-xs text-muted-foreground">
          LED currently shows step {led.stepNumber}'s {led.lit ? "active" : "inactive"} color. LED behavior is a best
          guess, not hardware-verified.
        </p>
      )}
    </div>
  );
}

function ControlTab() {
  const selectedControlId = usePacerStore((s) => s.selectedControlId);
  const preset = usePacerStore((s) => s.board.config.presets[s.board.activePresetIndex]);

  if (selectedControlId === undefined) {
    return <p className="text-sm text-muted-foreground">Press a switch to see its configuration on this preset.</p>;
  }
  const control = preset?.controls[selectedControlId];
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{controlLabel(selectedControlId)}</h3>
      {control ? (
        <ControlDetails controlId={selectedControlId} control={control} />
      ) : (
        <p className="text-sm text-muted-foreground">Not configured on this preset.</p>
      )}
    </div>
  );
}

function PresetTab({ preset, index }: { preset?: Preset; index: number }) {
  if (!preset)
    return (
      <p className="text-sm text-muted-foreground">Slot {presetIndexToLabel(index)} isn't in the loaded config.</p>
    );
  const settings = Object.entries(preset.midiSettings)
    .map(([n, s]) => [Number(n), s] as const)
    .filter(([, s]) => s !== undefined && presetMidiTypeName(s.msgType) !== "Off")
    .sort(([a], [b]) => a - b);

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold">{presetIndexToLabel(index)}</span>
        <span className="font-mono whitespace-pre text-muted-foreground">{preset.name ?? "(unnamed)"}</span>
        <span className="text-xs text-muted-foreground">idx {index}</span>
      </div>
      <div>
        <h4 className="mb-1 text-xs font-medium text-muted-foreground">MIDI sent on preset load</h4>
        {settings.length === 0 ? (
          <p className="text-xs text-muted-foreground">None.</p>
        ) : (
          <ul className="space-y-0.5 font-mono text-xs">
            {settings.map(([n, s]) => (
              <li key={n}>
                #{n} {presetMidiTypeName(s!.msgType)} ch{s!.channel + 1} [{s!.data.join(", ")}]
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Shown for reference; the simulator doesn't send these on preset change yet.
        </p>
      </div>
    </div>
  );
}

const SPECIAL_MODE_NOTES: Partial<Record<DeviceMode, string>> = {
  presetSelect: "Preset select is active: A-D pick a bank, 1-6 load a preset, [Preset] cancels.",
  track: "The built-in Track preset (DAW control) is active. Its switches are fixed by the firmware, not the config.",
  transport:
    "The built-in Transport preset (DAW control) is active. Its switches are fixed by the firmware, not the config.",
};

export function Inspector() {
  const index = usePacerStore((s) => s.board.activePresetIndex);
  const preset = usePacerStore((s) => s.board.config.presets[s.board.activePresetIndex]);
  const mode = usePacerStore((s) => s.deviceMode.mode);
  const note = SPECIAL_MODE_NOTES[mode];
  return (
    <Tabs defaultValue="control">
      {note && (
        <p className="mb-2 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-xs">
          {note} [Preset] returns to {presetIndexToLabel(index)}; the details below are for {presetIndexToLabel(index)}.
        </p>
      )}
      <TabsList>
        <TabsTrigger value="control">Control</TabsTrigger>
        <TabsTrigger value="preset">Preset</TabsTrigger>
      </TabsList>
      <TabsContent value="control" className="pt-2">
        <ControlTab />
      </TabsContent>
      <TabsContent value="preset" className="pt-2">
        <PresetTab preset={preset} index={index} />
      </TabsContent>
    </Tabs>
  );
}
