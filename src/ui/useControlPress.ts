// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { usePacerStore } from "../store/pacerStore";
import { useSettledPress } from "./useSettledPress";

/**
 * Press handling for a programmable control, via React Aria's `usePress` (mouse, touch, pen,
 * keyboard, and screen-reader activation, with the browser quirks handled), by way of
 * `useSettledPress`, so a drag to scroll that starts on a control never presses it.
 * - Play mode: pressing simulates the switch, and also selects it in the inspector.
 * - Edit mode: a completed press (a tap or a click, not a drag) selects it for editing. Nothing
 *   fires, so no MIDI is sent and the preset doesn't change.
 * - `live`: always simulates, whatever the mode. The editor renders one control this way so you
 *   can try the settings you're editing (see `LiveControl`).
 */
export function useControlPress(controlId: number, { live = false }: { live?: boolean } = {}) {
  const press = usePacerStore((s) => s.press);
  const release = usePacerStore((s) => s.release);
  const selectControl = usePacerStore((s) => s.selectControl);
  const editing = usePacerStore((s) => s.uiMode === "program") && !live;
  return useSettledPress(
    editing
      ? { onTap: () => selectControl(controlId) }
      : {
          onDown: () => {
            if (!live) selectControl(controlId);
            press(controlId);
          },
          onUp: () => release(controlId),
        },
  );
}
