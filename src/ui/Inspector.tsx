import { Badge } from "@/components/ui/badge";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ControlMode, STEPS_PER_CONTROL, presetIndexToLabel } from "../pacer/protocol/constants";
import type { LedConfig, Preset, Step, SwitchControl } from "../pacer/protocol/types";
import {
  channelLabel,
  controlKindOf,
  controlLabel,
  getControlDisplayState,
  messageTypeInfo,
  presetMidiTypeName,
  type ControlKind,
} from "../pacer/simulator";
import type { DeviceMode } from "../pacer/device";
import { indicatorForLedNum, switchSpecForControl } from "../pacer/hardware";
import { ledColorName } from "../pacer/protocol/ledColors";
import { usePacerStore } from "../store/pacerStore";
import { colorCodeCss } from "./panel/palette";

const MODE_NAMES: Record<number, string> = {
  [ControlMode.AllStepsAtOnce]: "All steps at once",
  [ControlMode.Sequence]: "Sequence",
  [ControlMode.ExternalStepSelect]: "External step select",
};

function LedSwatch({ code, label }: { code?: number; label: string }) {
  if (code === undefined) return <span className="text-muted-foreground">·</span>;
  const name = ledColorName(code);
  // The color's name is in the title and accessible name; no hover-only UI (tablets have no hover).
  return (
    <span
      role="img"
      className="inline-block size-3.5 rounded-full border border-white/20 align-middle"
      style={{ background: colorCodeCss(code) }}
      title={`${label}: ${name}`}
      aria-label={`${label}: ${name}`}
    />
  );
}

const FACE_NAMES = { bar: "bar", text: "text row", icons: "icon row" } as const;

/** Which light a step's LED num drives on this switch, per the hardware description. */
function ledTargetName(controlId: number, ledNum: number | undefined): string {
  const spec = switchSpecForControl(controlId);
  const indicator = spec ? indicatorForLedNum(spec, ledNum ?? 0) : undefined;
  if (!indicator) return "none";
  return ledNum ? FACE_NAMES[indicator.face.kind] : `${FACE_NAMES[indicator.face.kind]} (default)`;
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
  controlId,
  step,
  led,
  kind,
  current,
}: {
  n: number;
  controlId: number;
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
      <td className="px-1.5 py-1 tabular-nums">{step ? channelLabel(step.channel) : ""}</td>
      {step ? <DataCells step={step} kind={kind} /> : <td colSpan={3} />}
      {kind === "switch" && (
        <td className="space-x-1 px-1.5 py-1 whitespace-nowrap">
          <LedSwatch code={led?.activeColor} label="Active" />
          <LedSwatch code={led?.inactiveColor} label="Inactive" />
          {led && <span className="text-[10px] text-muted-foreground">{ledTargetName(controlId, led.position)}</span>}
        </td>
      )}
    </tr>
  );
}

function ControlDetails({ controlId, control }: { controlId: number; control: SwitchControl }) {
  const board = usePacerStore((s) => s.board);
  const kind = controlKindOf(controlId) ?? "switch";
  const display = getControlDisplayState(board, controlId);
  const mode = control.controlMode ?? ControlMode.AllStepsAtOnce;
  const hasLeds = Object.keys(control.led).length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{MODE_NAMES[mode] ?? `Mode 0x${mode.toString(16)}`}</Badge>
        {display.pressed && <Badge>held</Badge>}
        {display.valueOnSteps.length > 0 && <Badge variant="outline">on: step {display.valueOnSteps.join(", ")}</Badge>}
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
                controlId={controlId}
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
      {hasLeds && (
        <p className="text-xs text-muted-foreground">
          LED: active/inactive color, then which light the step drives (its LED num). Which steps' LEDs show at once is
          a best guess, not hardware-verified.
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
                #{n} {presetMidiTypeName(s!.msgType)} ch {channelLabel(s!.channel)} [{s!.data.join(", ")}]
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
    <Tabs defaultSelectedKey="control">
      {note && (
        <p className="mb-2 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-xs">
          {note} [Preset] returns to {presetIndexToLabel(index)}; the details below are for {presetIndexToLabel(index)}.
        </p>
      )}
      <TabList aria-label="Inspector">
        <Tab id="control">Control</Tab>
        <Tab id="preset">Preset</Tab>
      </TabList>
      <TabPanel id="control" className="pt-2">
        <ControlTab />
      </TabPanel>
      <TabPanel id="preset" className="pt-2">
        <PresetTab preset={preset} index={index} />
      </TabPanel>
    </Tabs>
  );
}
