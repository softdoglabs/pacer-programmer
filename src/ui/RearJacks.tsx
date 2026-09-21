import { rearControls } from "../pacer/hardware";
import { controlKindOf, controlLabel, getControlDisplayState, summarizeControl } from "../pacer/simulator";
import { usePacerStore } from "../store/pacerStore";
import { cn } from "@/lib/utils";
import { useControlPress } from "./useControlPress";

function ExternalControl({ controlId, hint }: { controlId: number; hint?: string }) {
  const board = usePacerStore((s) => s.board);
  const selected = usePacerStore((s) => s.selectedControlId === controlId);
  const { pressProps } = useControlPress(controlId);
  const control = board.config.presets[board.activePresetIndex]?.controls[controlId];
  const { pressed } = getControlDisplayState(board, controlId);

  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "flex min-w-0 flex-col items-start rounded-md border bg-card px-3 py-2 text-left transition-colors select-none touch-none",
        "hover:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none",
        pressed && "translate-y-px bg-accent",
        selected && "border-primary",
        !control && "opacity-50",
      )}
      {...pressProps}
    >
      <span className="text-xs text-muted-foreground">{controlLabel(controlId)}</span>
      <span className="truncate font-mono text-sm font-semibold">
        {summarizeControl(control, controlKindOf(controlId)!)}
      </span>
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </button>
  );
}

/** Controls plugged into the rear jacks (NP-1 footswitches, NX-P expression pedals): not on the faceplate itself. */
export function RearJacks() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {rearControls().map((spec) =>
        spec.controlId === undefined ? null : (
          <ExternalControl
            key={spec.id}
            controlId={spec.controlId}
            // Expression pedals are simulated as digital: held = toe down (max), released = heel down (min).
            hint={spec.kind === "expressionPedal" ? "hold = toe down" : undefined}
          />
        ),
      )}
    </div>
  );
}
