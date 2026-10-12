// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { ToggleGroup } from "@/components/ui/toggle-group";
import { presetIndexToLabel } from "../../pacer/protocol/constants";
import type { EditScope } from "../../store/editingSlice";
import { usePacerStore } from "../../store/pacerStore";
import { useStateOfPreset } from "../useMachine";

/**
 * What the editor's changes reach, shown only when the preset in front of you is one of several
 * that behave alike.
 *
 * The map presents those as one state, and they only stay one while they're changed together —
 * keeping copies in step by hand is the work this project exists to remove. So "all of them" is
 * the default, and this is the deliberate way to make one differ.
 */
export function EditScopeControl() {
  const uiMode = usePacerStore((s) => s.uiMode);
  const index = usePacerStore((s) => s.board.activePresetIndex);
  const scope = usePacerStore((s) => s.editScope);
  const setEditScope = usePacerStore((s) => s.setEditScope);
  const { name, members } = useStateOfPreset();
  // Program only: a route belongs to the state whatever this says, so offering the choice on the
  // map would imply something about rerouting that isn't true.
  if (uiMode !== "program" || members.length <= 1) return null;

  const where = members.map(presetIndexToLabel).join(", ");
  return (
    <ToggleGroup<EditScope>
      label="Changes"
      labelVisible
      options={[
        {
          id: "state",
          label: `All ${members.length} presets`,
          title: `${name ? `“${name}”` : "This state"} is ${where}. Changing them together is what keeps them one state.`,
        },
        {
          id: "preset",
          label: `${presetIndexToLabel(index)} only`,
          title: `Change this preset alone, so it stops behaving like the others${name ? ` and leaves “${name}”` : ""}.`,
        },
      ]}
      value={scope}
      onChange={setEditScope}
    />
  );
}
