// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { Button } from "@/components/ui/button";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { setControlMode, updateStep } from "../../pacer/editing";
import { switchSpecForControl } from "../../pacer/hardware";
import { ControlMode, STEPS_PER_CONTROL } from "../../pacer/protocol/constants";
import { showingStep } from "../../pacer/panel";
import { controlKindOf } from "../../pacer/simulator";
import { usePacerStore } from "../../store/pacerStore";
import { useEditTargets } from "../useMachine";
import { StepCard } from "./StepCard";

const MODE_OPTIONS = [
  {
    id: String(ControlMode.AllStepsAtOnce),
    label: "All at once",
    title: "Every active step fires together on one press",
  },
  {
    id: String(ControlMode.Sequence),
    label: "Sequence",
    title: "Each press fires the next active step, wrapping after the last",
  },
  {
    id: String(ControlMode.ExternalStepSelect),
    label: "External step",
    title: "Another control chooses which step this one fires",
  },
] as const;

function ControlEditor({ controlId }: { controlId: number }) {
  const presetIndex = usePacerStore((s) => s.board.activePresetIndex);
  // How many presets this edit reaches: every preset the state is, unless it's been narrowed to
  // this one (see `editTargets`).
  const copies = useEditTargets().length;
  const control = usePacerStore((s) => s.board.config.presets[s.board.activePresetIndex]?.controls[controlId]);
  const applyPresetEdit = usePacerStore((s) => s.applyPresetEdit);
  const kind = controlKindOf(controlId) ?? "switch";
  const spec = switchSpecForControl(controlId);
  const mode = control?.controlMode ?? ControlMode.AllStepsAtOnce;
  // Which step's LED config the switch is showing right now (see the LED model in CLAUDE.md).
  const runtime = usePacerStore((s) => s.board.controls[controlId]);
  const litStep = control ? showingStep(control, runtime) : undefined;
  // Step 1 always exists (a control needs at least one step); others show only while in use.
  // Removing a step just turns it off, so its settings come back if it's added again.
  const stepNumbers = Array.from({ length: STEPS_PER_CONTROL }, (_, i) => i + 1);
  const shownSteps = stepNumbers.filter((n) => n === 1 || control?.steps[n]?.active);
  const nextFreeStep = stepNumbers.find((n) => !shownSteps.includes(n));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Fires</span>
        <ToggleGroup
          label="Control mode"
          options={MODE_OPTIONS}
          value={String(mode) as (typeof MODE_OPTIONS)[number]["id"]}
          onChange={(v) => applyPresetEdit((c, i) => setControlMode(c, i, controlId, Number(v) as ControlMode))}
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
      {/* One step per row: each card spans the width, so its fields and color grids lay out wide. */}
      <div className="flex flex-col gap-3">
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
            drivesLight={n === litStep}
            mode={mode}
            copies={copies}
          />
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        isDisabled={nextFreeStep === undefined}
        title={
          nextFreeStep === undefined
            ? `All ${STEPS_PER_CONTROL} steps are in use`
            : `Turn on step ${nextFreeStep}, so this control fires one more message`
        }
        onPress={() =>
          nextFreeStep !== undefined &&
          applyPresetEdit((c, i) => updateStep(c, i, controlId, nextFreeStep, { active: true }))
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
