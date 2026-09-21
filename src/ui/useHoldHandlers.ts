import { useRef, type KeyboardEvent, type PointerEvent } from "react";

function isActivationKey(key: string) {
  return key === " " || key === "Enter";
}

/**
 * Press/release handlers for an on-screen momentary switch, via pointer (with capture, so
 * dragging off the switch doesn't strand it "held") or keyboard (Space/Enter). Guards against
 * duplicate downs/ups so the engine only ever sees one press followed by one release.
 */
export function useHoldHandlers(onDown: () => void, onUp?: () => void) {
  const held = useRef(false);

  const down = () => {
    if (held.current) return;
    held.current = true;
    onDown();
  };
  const up = () => {
    if (!held.current) return;
    held.current = false;
    onUp?.();
  };

  return {
    onPointerDown: (e: PointerEvent<Element>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      down();
    },
    onPointerUp: up,
    onPointerCancel: up,
    onLostPointerCapture: up,
    onKeyDown: (e: KeyboardEvent<Element>) => {
      if (!isActivationKey(e.key)) return;
      e.preventDefault();
      if (!e.repeat) down();
    },
    onKeyUp: (e: KeyboardEvent<Element>) => {
      if (!isActivationKey(e.key)) return;
      e.preventDefault();
      up();
    },
    onBlur: up,
  };
}
