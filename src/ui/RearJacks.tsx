import { rearControls } from "../pacer/hardware";
import { RearControl } from "./panel/RearControl";

/**
 * Controls plugged into the rear jacks (NP-1 footswitches, NX-P expression pedals). They're part
 * of the hardware, so they sit with the faceplate rather than in a panel of their own.
 */
export function RearJacks() {
  return (
    <div className="grid auto-rows-fr grid-cols-3 gap-2 sm:grid-cols-6">
      {rearControls().map((spec) =>
        spec.controlId === undefined ? null : <RearControl key={spec.id} controlId={spec.controlId} />,
      )}
    </div>
  );
}
