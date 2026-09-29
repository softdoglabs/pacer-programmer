import { useMemo } from "react";
import { recoverMachine } from "../../pacer/analysis";
import { editTargets } from "../../store/editingSlice";
import { usePacerStore } from "../../store/pacerStore";

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

/** The state the current preset belongs to, when it's more than one preset. */
export function useStateOfPreset(): { name?: string; members: number[] } {
  const config = usePacerStore((s) => s.board.config);
  const index = usePacerStore((s) => s.board.activePresetIndex);
  return useMemo(() => {
    const machine = recoverMachine(config);
    const state = machine.states.find((s) => (machine.members[s.id] ?? []).includes(index));
    const members = state ? (machine.members[state.id] ?? []) : [];
    const name = state?.name?.trim();
    return { ...(name ? { name } : {}), members };
  }, [config, index]);
}
