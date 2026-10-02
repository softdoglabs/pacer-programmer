import { useMemo } from "react";
import { machineOf, stateContaining, type RecoveredMachine } from "../pacer/analysis";
import { editTargets } from "../store/editingSlice";
import { usePacerStore } from "../store/pacerStore";

/*
 * The state machine, for components. One object per configuration version (see `machineOf`), so
 * the map, the chooser, the editor and the display can't each hold their own idea of what the
 * states are. Anything that wants the states asks here rather than recovering them itself.
 */

/** The machine the working configuration is. */
export function useMachine(): RecoveredMachine {
  return machineOf(usePacerStore((s) => s.board.config));
}

/** The state the current preset is one of — its name and every preset it is. */
export function useStateOfPreset(): { name?: string; members: number[] } {
  const machine = useMachine();
  const index = usePacerStore((s) => s.board.activePresetIndex);
  return useMemo(() => {
    const found = stateContaining(machine, index);
    const name = found?.state.name?.trim();
    return { ...(name ? { name } : {}), members: found?.members ?? [] };
  }, [machine, index]);
}

/**
 * The presets an edit reaches: every preset the current one behaves like, or just it.
 *
 * The map draws a state as one thing however many presets the hardware needed for it, and opening
 * one from there to change it alone is how a state quietly comes apart — so the editor writes to
 * all of them by default. Narrowing it is `editScope`, which is the deliberate way to make one
 * copy differ.
 */
export function useEditTargets(): number[] {
  const config = usePacerStore((s) => s.board.config);
  const index = usePacerStore((s) => s.board.activePresetIndex);
  const scope = usePacerStore((s) => s.editScope);
  return useMemo(() => editTargets(config, index, scope), [config, index, scope]);
}
