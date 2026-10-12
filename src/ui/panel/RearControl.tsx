// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { cn } from "@/lib/utils";
import { switchSpecForControl } from "../../pacer/hardware";
import { controlKindOf, controlLabel, getControlDisplayState, summarizeControl } from "../../pacer/simulator";
import { usePacerStore } from "../../store/pacerStore";
import { useControlPress } from "../useControlPress";
import { EditBadge } from "./EditBadge";

/** Shared frame so a rear-jack control looks the same on the faceplate and in the editor. */
function Jack({
  controlId,
  selected,
  editable,
  onEdit,
  children,
  ...rest
}: {
  controlId: number;
  selected: boolean;
  editable: boolean;
  /** Given when the tile isn't itself a button, so the badge has to be one (see `EditBadge`). */
  onEdit?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const control = usePacerStore((s) => s.board.config.presets[s.board.activePresetIndex]?.controls[controlId]);
  return (
    <div
      className={cn(
        "relative flex h-full min-w-0 flex-col items-start gap-1 rounded-md border bg-card px-3 py-2",
        selected && "border-primary",
        !control && "opacity-60",
        rest.className,
      )}
    >
      <span className="w-full truncate text-xs text-muted-foreground">{controlLabel(controlId)}</span>
      <span className="w-full truncate font-mono text-sm font-semibold">
        {summarizeControl(control, controlKindOf(controlId)!)}
      </span>
      {children}
      {editable && <EditBadge onPress={onEdit} label={onEdit ? `Program ${controlLabel(controlId)}` : undefined} />}
    </div>
  );
}

/** An NP-1 footswitch: a plain press. */
function FootswitchControl({ controlId, live }: { controlId: number; live: boolean }) {
  const selected = usePacerStore((s) => s.selectedControlId === controlId);
  const editable = usePacerStore((s) => s.uiMode === "program") && !live;
  const { pressProps } = useControlPress(controlId, { live });
  const pressed = usePacerStore((s) => getControlDisplayState(s.board, controlId).pressed);
  const control = usePacerStore((s) => s.board.config.presets[s.board.activePresetIndex]?.controls[controlId]);
  const label = controlLabel(controlId);
  const title = editable
    ? `Program ${label}`
    : control
      ? `${label}: ${summarizeControl(control, controlKindOf(controlId)!)}`
      : `${label}: not configured on this preset`;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      aria-label={`${live ? "Try" : "Switch"} ${controlLabel(controlId)}`}
      className={cn(
        "h-full touch-none rounded-md text-left outline-none select-none",
        "ring-focus",
        pressed && "translate-y-px",
      )}
      {...pressProps}
    >
      <Jack controlId={controlId} selected={selected} editable={editable} className={pressed ? "bg-accent" : undefined}>
        <span className="mt-auto text-[10px] text-muted-foreground">press</span>
      </Jack>
    </button>
  );
}

/**
 * An NX-P expression pedal: swept, not pressed. Moving it fires the pedal's steps at that
 * position, which is what the hardware sends as you rock it (see `BoardEvent.position`).
 */
function PedalControl({ controlId, live }: { controlId: number; live: boolean }) {
  const selected = usePacerStore((s) => s.selectedControlId === controlId);
  const editing = usePacerStore((s) => s.uiMode === "program");
  const editable = editing && !live;
  const movePedal = usePacerStore((s) => s.movePedal);
  const selectControl = usePacerStore((s) => s.selectControl);
  // The pedal's position is device state, so the faceplate and the editor's live copy agree.
  const position = usePacerStore((s) => s.board.pedals[controlId] ?? 0);
  const label = controlLabel(controlId);

  return (
    <Jack controlId={controlId} selected={selected} editable={editable} onEdit={() => selectControl(controlId)}>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(position * 100)}
        aria-label={`${label}: heel to toe`}
        title={editable ? `Program ${label}` : `${label}: drag from heel to toe`}
        className="w-full accent-primary"
        onPointerDown={() => !live && editing && selectControl(controlId)}
        // In Edit mode the faceplate copy only selects; the editor's live copy sweeps.
        onChange={(e) => (live || !editing) && movePedal(controlId, Number(e.target.value) / 100)}
      />
      <span className="mt-auto text-[10px] text-muted-foreground">heel → toe ({Math.round(position * 100)}%)</span>
    </Jack>
  );
}

/** A control plugged into a rear jack. `live` presses/sweeps it even in Edit mode (the editor's copy). */
export function RearControl({ controlId, live = false }: { controlId: number; live?: boolean }) {
  const spec = switchSpecForControl(controlId);
  return spec?.kind === "expressionPedal" ? (
    <PedalControl controlId={controlId} live={live} />
  ) : (
    <FootswitchControl controlId={controlId} live={live} />
  );
}
