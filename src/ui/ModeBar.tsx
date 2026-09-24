import { ToggleGroup } from "@/components/ui/toggle-group";
import type { UiMode } from "../store/editingSlice";
import { usePacerStore } from "../store/pacerStore";

/*
 * The app's top-level modes. Each owns a context bar holding only its own controls, which is what
 * keeps the simulator's MIDI output (out to the rig) apart from the Pacer connection (in and out,
 * over SysEx) — see "Planned UI reorganization" in CLAUDE.md. The analysis views join this list
 * as they're built; they aren't shown before then, since a disabled tab is just clutter.
 */
const MODES: { id: UiMode; label: string; title: string }[] = [
  { id: "simulate", label: "Simulate", title: "Pressing a control runs it and sends its MIDI" },
  { id: "program", label: "Program", title: "Pressing a control opens it for programming instead of firing it" },
];

export function ModeBar() {
  const uiMode = usePacerStore((s) => s.uiMode);
  const setUiMode = usePacerStore((s) => s.setUiMode);
  return <ToggleGroup<UiMode> label="Mode" options={MODES} value={uiMode} onChange={setUiMode} />;
}
