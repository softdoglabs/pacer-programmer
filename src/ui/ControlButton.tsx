import { controlLabel, getControlDisplayState } from "../pacer/simulator";
import { usePacerStore } from "../store/pacerStore";

export function ControlButton({ controlId }: { controlId: number }) {
  const board = usePacerStore((s) => s.board);
  const press = usePacerStore((s) => s.press);
  const release = usePacerStore((s) => s.release);
  const display = getControlDisplayState(board, controlId);

  const classNames = ["control-button"];
  if (display.pressed) classNames.push("is-pressed");
  if (display.activeToggleSteps.length > 0) classNames.push("is-toggled-on");

  return (
    <button
      type="button"
      className={classNames.join(" ")}
      onMouseDown={() => press(controlId)}
      onMouseUp={() => release(controlId)}
      onMouseLeave={() => {
        if (display.pressed) release(controlId);
      }}
    >
      <div>{controlLabel(controlId)}</div>
      {display.sequencePointer !== undefined && <div className="control-sub">step {display.sequencePointer}</div>}
    </button>
  );
}
