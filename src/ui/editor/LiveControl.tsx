import { useMemo } from "react";
import { computePanelState, switchHint } from "../../pacer/panel";
import { switchSpecForControl } from "../../pacer/hardware";
import { usePacerStore } from "../../store/pacerStore";
import { RearControl } from "../panel/RearControl";
import { SwitchView } from "../panel/SwitchView";
import { useControlPress } from "../useControlPress";

/**
 * The control being edited, on its own and live: pressing it runs the simulator exactly as in
 * Play mode, so you can try the settings you're editing — the MIDI goes out, its lights follow,
 * and the log records it. Editing is otherwise press-free, which is why this one is special-cased.
 */
export function LiveControl({ controlId }: { controlId: number }) {
  const spec = switchSpecForControl(controlId);
  const board = usePacerStore((s) => s.board);
  const deviceMode = usePacerStore((s) => s.deviceMode);
  const { pressProps } = useControlPress(controlId, { live: true });
  const panel = useMemo(() => computePanelState(board, deviceMode), [board, deviceMode]);
  if (!spec) return null;
  // Rear-jack controls have no housing or lights; they look the same here as on the faceplate.
  if (spec.placement.kind === "rear") {
    return (
      <div className="flex flex-col gap-1">
        <RearControl controlId={controlId} live />
        <p className="text-center text-xs text-muted-foreground">Try it here</p>
      </div>
    );
  }

  const state = panel.switches[spec.id];
  const hint = switchHint(spec, board.config, board.activePresetIndex, deviceMode.mode, deviceMode.pendingBank);
  if (!state) return null;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-full max-w-36">
        <div className="aspect-[196/236]">
          <SwitchView
            spec={spec}
            state={state}
            selected={false}
            ariaLabel={`Try ${spec.name}: ${hint ?? "—"}`}
            title={hint ? `${spec.name}: ${hint}` : `${spec.name}: not configured on this preset`}
            pressProps={pressProps}
          />
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">Press to try it</p>
    </div>
  );
}
