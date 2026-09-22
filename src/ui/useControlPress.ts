import { usePress } from "react-aria";
import { usePacerStore } from "../store/pacerStore";

/**
 * Press handling for a programmable control, via React Aria's `usePress` (mouse, touch, pen,
 * keyboard, and screen-reader activation, with the browser quirks handled).
 * - Play mode: pressing simulates the switch, and also selects it in the inspector.
 * - Edit mode: pressing only selects it for editing. Nothing fires, so no MIDI is sent and the
 *   preset doesn't change.
 * - `live`: always simulates, whatever the mode. The editor renders one control this way so you
 *   can try the settings you're editing (see `LiveControl`).
 */
export function useControlPress(controlId: number, { live = false }: { live?: boolean } = {}) {
  const press = usePacerStore((s) => s.press);
  const release = usePacerStore((s) => s.release);
  const selectControl = usePacerStore((s) => s.selectControl);
  const editing = usePacerStore((s) => s.uiMode === "edit") && !live;
  return usePress({
    onPressStart: () => {
      if (!live) selectControl(controlId);
      if (!editing) press(controlId);
    },
    onPressEnd: () => {
      if (!editing) release(controlId);
    },
  });
}
