import { useState } from "react";
import { Input, Label, TextField } from "react-aria-components";
import { Button } from "@/components/ui/button";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { PRESET_NAME_LENGTH, renamePreset, setControlMode, updateStep } from "../../pacer/editing";
import { switchSpecForControl } from "../../pacer/hardware";
import { ControlMode, STEPS_PER_CONTROL, presetIndexToLabel } from "../../pacer/protocol/constants";
import { controlKindOf, controlLabel } from "../../pacer/simulator";
import { usePacerStore } from "../../store/pacerStore";
import { StepCard } from "./StepCard";

const MODE_OPTIONS = [
  { id: String(ControlMode.AllStepsAtOnce), label: "All at once" },
  { id: String(ControlMode.Sequence), label: "Sequence" },
  { id: String(ControlMode.ExternalStepSelect), label: "External step" },
] as const;

/** The preset's 5-character name. Committed on Enter or when the field loses focus (one undo step per rename). */
function PresetNameField() {
  const presetIndex = usePacerStore((s) => s.board.activePresetIndex);
  const name = usePacerStore((s) => s.board.config.presets[s.board.activePresetIndex]?.name ?? "");
  const applyEdit = usePacerStore((s) => s.applyEdit);
  const [draft, setDraft] = useState<string>();
  const commit = () => {
    if (draft !== undefined && draft.trimEnd() !== name.trimEnd())
      applyEdit((c) => renamePreset(c, presetIndex, draft));
    setDraft(undefined);
  };
  return (
    <TextField
      className="flex items-center gap-3"
      value={draft ?? name.trimEnd()}
      onChange={setDraft}
      maxLength={PRESET_NAME_LENGTH}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    >
      <Label className="text-sm font-semibold">Preset {presetIndexToLabel(presetIndex)}</Label>
      <Input className="h-9 w-28 rounded-md border bg-card px-2 font-mono text-sm uppercase outline-none data-[focused]:ring-[3px] data-[focused]:ring-ring/50" />
      <span className="text-xs text-muted-foreground">up to {PRESET_NAME_LENGTH} characters</span>
    </TextField>
  );
}

function ControlEditor({ controlId }: { controlId: number }) {
  const presetIndex = usePacerStore((s) => s.board.activePresetIndex);
  const control = usePacerStore((s) => s.board.config.presets[s.board.activePresetIndex]?.controls[controlId]);
  const applyEdit = usePacerStore((s) => s.applyEdit);
  const kind = controlKindOf(controlId) ?? "switch";
  const spec = switchSpecForControl(controlId);
  const mode = control?.controlMode ?? ControlMode.AllStepsAtOnce;
  // Step 1 always exists (a control needs at least one step); others show only while in use.
  // Removing a step just turns it off, so its settings come back if it's added again.
  const stepNumbers = Array.from({ length: STEPS_PER_CONTROL }, (_, i) => i + 1);
  const shownSteps = stepNumbers.filter((n) => n === 1 || control?.steps[n]?.active);
  const nextFreeStep = stepNumbers.find((n) => !shownSteps.includes(n));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{controlLabel(controlId)}</h3>
        <ToggleGroup
          label="Control mode"
          options={MODE_OPTIONS}
          value={String(mode) as (typeof MODE_OPTIONS)[number]["id"]}
          onChange={(v) => applyEdit((c) => setControlMode(c, presetIndex, controlId, Number(v) as ControlMode))}
        />
      </div>
      {mode === ControlMode.Sequence && (
        <p className="text-xs text-muted-foreground">Each press fires the next active step, in order.</p>
      )}
      {mode === ControlMode.ExternalStepSelect && (
        <p className="text-xs text-muted-foreground">
          Another switch's Step Select / Step Inc/Dec picks which step fires.
        </p>
      )}
      {shownSteps.map((n) => (
        <StepCard
          key={n}
          presetIndex={presetIndex}
          controlId={controlId}
          kind={kind}
          spec={spec}
          n={n}
          step={control?.steps[n]}
          led={control?.led[n]}
        />
      ))}
      <Button
        variant="outline"
        size="sm"
        isDisabled={nextFreeStep === undefined}
        onPress={() =>
          nextFreeStep !== undefined &&
          applyEdit((c) => updateStep(c, presetIndex, controlId, nextFreeStep, { active: true }))
        }
      >
        + Add step{nextFreeStep === undefined ? ` (all ${STEPS_PER_CONTROL} in use)` : ""}
      </Button>
    </div>
  );
}

/** Edit mode's side panel: the preset's name and the selected control's programming. */
export function EditorPanel() {
  const selectedControlId = usePacerStore((s) => s.selectedControlId);
  const deviceMode = usePacerStore((s) => s.deviceMode.mode);
  return (
    <div className="space-y-4">
      <PresetNameField />
      {deviceMode !== "user" && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs">
          A built-in firmware mode is showing; edits apply to the user preset underneath.
        </p>
      )}
      {selectedControlId === undefined ? (
        <p className="text-sm text-muted-foreground">
          Tap a switch on the faceplate (or a rear-jack control) to program it.
        </p>
      ) : (
        <ControlEditor controlId={selectedControlId} />
      )}
    </div>
  );
}
