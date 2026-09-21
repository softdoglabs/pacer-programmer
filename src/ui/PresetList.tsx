import { PRESET_COUNT, presetIndexToLabel } from "../pacer/protocol/constants";
import { useShallow } from "zustand/react/shallow";
import { usePacerStore } from "../store/pacerStore";
import { cn } from "@/lib/utils";

function PresetButton({ index }: { index: number }) {
  const preset = usePacerStore((s) => s.board.config.presets[index]);
  const active = usePacerStore((s) => s.board.activePresetIndex === index);
  const jumpToPreset = usePacerStore((s) => s.jumpToPreset);

  return (
    <button
      type="button"
      onClick={() => jumpToPreset(index)}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex items-baseline gap-2 rounded-md border px-2 py-1 text-left text-sm transition-colors outline-none",
        "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active ? "border-primary bg-primary/15" : "border-transparent",
        !preset && "text-muted-foreground",
      )}
    >
      <span className="w-7 shrink-0 font-semibold tabular-nums">{presetIndexToLabel(index)}</span>
      <span className="truncate font-mono text-xs whitespace-pre">{preset?.name ?? "—"}</span>
    </button>
  );
}

/** Every preset slot in the loaded config, in bank columns. Clicking jumps directly (an app shortcut, not a hardware action). */
export function PresetList() {
  const presetIndices = usePacerStore(useShallow((s) => Object.keys(s.board.config.presets).map(Number)));
  const extraSlots = presetIndices.filter((i) => i >= PRESET_COUNT).sort((a, b) => a - b);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((bank) => (
          <div key={bank} className="flex flex-col">
            <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">Bank {"ABCD"[bank]}</div>
            {Array.from({ length: 6 }, (_, n) => (
              <PresetButton key={n} index={bank * 6 + n} />
            ))}
          </div>
        ))}
      </div>
      {extraSlots.length > 0 && (
        <div>
          <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">Other slots (not reachable from the front panel)</div>
          <div className="flex flex-wrap gap-1">
            {extraSlots.map((i) => (
              <PresetButton key={i} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
