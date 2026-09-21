import { ControlId } from "../pacer/protocol/constants";
import { controlKindOf, controlLabel, getControlDisplayState, summarizeControl } from "../pacer/simulator";
import { usePacerStore } from "../store/pacerStore";
import { cn } from "@/lib/utils";
import { useControlHandlers } from "./useControlHandlers";

const EXTERNAL_CONTROLS: { controlId: number; hint?: string }[] = [
  { controlId: ControlId.Footswitch1 },
  { controlId: ControlId.Footswitch2 },
  { controlId: ControlId.Footswitch3 },
  { controlId: ControlId.Footswitch4 },
  { controlId: ControlId.ExpressionPedal1, hint: "hold = toe down" },
  { controlId: ControlId.ExpressionPedal2, hint: "hold = toe down" },
];

function ExternalControl({ controlId, hint }: { controlId: number; hint?: string }) {
  const board = usePacerStore((s) => s.board);
  const selected = usePacerStore((s) => s.selectedControlId === controlId);
  const handlers = useControlHandlers(controlId);
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
      {...handlers}
    >
      <span className="text-xs text-muted-foreground">{controlLabel(controlId)}</span>
      <span className="truncate font-mono text-sm font-semibold">{summarizeControl(control, controlKindOf(controlId)!)}</span>
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </button>
  );
}

/** Controls plugged into the rear jacks (NP-1 footswitches, NX-P expression pedals): not on the faceplate itself. */
export function RearJacks() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {EXTERNAL_CONTROLS.map((c) => (
        <ExternalControl key={c.controlId} {...c} />
      ))}
    </div>
  );
}
