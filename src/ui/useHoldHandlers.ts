import { useEffect, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

function isActivationKey(key: string) {
  return key === " " || key === "Enter";
}

/**
 * Press/release handlers for an on-screen momentary switch, via pointer or keyboard (Space/Enter).
 * Guards against duplicate downs/ups, so the engine only ever sees one press followed by one release.
 *
 * A pointer hold ends only on that pointer's own pointerup/pointercancel, listened for on `window`
 * so dragging off the switch still releases it. It deliberately ignores focus and pointer-capture
 * changes: the first click into an inactive browser window moves focus around mid-press, which
 * used to end the hold early and turn a long [Preset] hold into a tap. Blur only ends keyboard
 * holds, since otherwise the keyup would never arrive.
 */
export function useHoldHandlers(onDown: () => void, onUp?: () => void) {
  const heldBy = useRef<"pointer" | "key" | null>(null);
  const removeWindowListeners = useRef<(() => void) | null>(null);
  // Latest callbacks, so a window listener registered at press time never calls a stale one.
  const callbacks = useRef({ onDown, onUp });
  callbacks.current = { onDown, onUp };

  const down = (source: "pointer" | "key") => {
    if (heldBy.current) return false;
    heldBy.current = source;
    callbacks.current.onDown();
    return true;
  };
  const up = () => {
    if (!heldBy.current) return;
    heldBy.current = null;
    removeWindowListeners.current?.();
    removeWindowListeners.current = null;
    callbacks.current.onUp?.();
  };

  useEffect(() => () => removeWindowListeners.current?.(), []);

  return {
    onPointerDown: (e: ReactPointerEvent<Element>) => {
      if (e.button !== 0 || !down("pointer")) return;
      const pointerId = e.pointerId;
      const end = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) up();
      };
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      removeWindowListeners.current = () => {
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
      };
    },
    onKeyDown: (e: KeyboardEvent<Element>) => {
      if (!isActivationKey(e.key)) return;
      e.preventDefault();
      if (!e.repeat) down("key");
    },
    onKeyUp: (e: KeyboardEvent<Element>) => {
      if (!isActivationKey(e.key)) return;
      e.preventDefault();
      if (heldBy.current === "key") up();
    },
    onBlur: () => {
      if (heldBy.current === "key") up();
    },
  };
}
