// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHoldHandlers } from "../useHoldHandlers";

function HoldButton({ onDown, onUp }: { onDown: () => void; onUp: () => void }) {
  return (
    <button type="button" {...useHoldHandlers(onDown, onUp)}>
      hold me
    </button>
  );
}

function setup() {
  const onDown = vi.fn();
  const onUp = vi.fn();
  render(<HoldButton onDown={onDown} onUp={onUp} />);
  return { onDown, onUp, button: screen.getByRole("button") };
}

afterEach(cleanup);

describe("useHoldHandlers", () => {
  it("a pointer hold survives focus changes and ends on pointerup anywhere", () => {
    const { onDown, onUp, button } = setup();
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    fireEvent.blur(button); // e.g. the first click into an inactive browser window
    fireEvent.focus(button);
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onUp).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, { pointerId: 1 }); // released after dragging off the switch
    expect(onUp).toHaveBeenCalledTimes(1);
  });

  it("ignores other pointers' releases and non-primary buttons", () => {
    const { onDown, onUp, button } = setup();
    fireEvent.pointerDown(button, { button: 2, pointerId: 1 });
    expect(onDown).not.toHaveBeenCalled();
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 2 });
    expect(onUp).not.toHaveBeenCalled();
    fireEvent.pointerCancel(window, { pointerId: 1 });
    expect(onUp).toHaveBeenCalledTimes(1);
  });

  it("a keyboard hold ends on keyup or blur, and ignores key repeat", () => {
    const { onDown, onUp, button } = setup();
    fireEvent.keyDown(button, { key: " " });
    fireEvent.keyDown(button, { key: " ", repeat: true });
    expect(onDown).toHaveBeenCalledTimes(1);
    fireEvent.blur(button);
    expect(onUp).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(button, { key: " " });
    expect(onUp).toHaveBeenCalledTimes(1);
  });
});
