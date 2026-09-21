import { usePress } from "react-aria";
import { usePacerStore } from "../store/pacerStore";

/**
 * Press handling for a programmable control, via React Aria's `usePress` (mouse, touch, pen,
 * keyboard, and screen-reader activation, with the browser quirks handled). Pressing also
 * selects the control in the inspector.
 */
export function useControlPress(controlId: number) {
  const press = usePacerStore((s) => s.press);
  const release = usePacerStore((s) => s.release);
  const selectControl = usePacerStore((s) => s.selectControl);
  return usePress({
    onPressStart: () => {
      selectControl(controlId);
      press(controlId);
    },
    onPressEnd: () => release(controlId),
  });
}
