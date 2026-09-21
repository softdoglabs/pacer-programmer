import { usePacerStore } from "../store/pacerStore";
import { useHoldHandlers } from "./useHoldHandlers";

/** Hold handlers for a programmable control: pressing also selects it in the inspector. */
export function useControlHandlers(controlId: number) {
  const press = usePacerStore((s) => s.press);
  const release = usePacerStore((s) => s.release);
  const selectControl = usePacerStore((s) => s.selectControl);
  return useHoldHandlers(
    () => {
      selectControl(controlId);
      press(controlId);
    },
    () => release(controlId),
  );
}
