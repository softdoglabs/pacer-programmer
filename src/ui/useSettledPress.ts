// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { useEffect, useRef } from "react";
import { usePress, type PressEvent } from "react-aria";

/**
 * How long a finger has to stay put before a touch counts as pressing down. A finger that moves
 * within it is a scroll: the browser takes it over and cancels the press, so nothing fires.
 */
export const TOUCH_SETTLE_MS = 150;

/**
 * A press that is a down and an up, like a footswitch, where a drag to scroll is never a press
 * (owner's rule). Mouse, pen and keyboard go down at once. A touch waits TOUCH_SETTLE_MS, since the
 * faceplate scrolls by touch on a phone and a swipe across it starts on a switch:
 * - held still that long, it goes down then, and up when the finger lifts (so a held switch, or
 *   the [Preset] hold, still works);
 * - lifted sooner, it's a tap: down and up together;
 * - moved, the browser scrolls instead and cancels it: nothing at all.
 *
 * `onTap` is the completed press, for what should happen once rather than while held (opening a
 * control for editing). A drag never completes one, by touch or by mouse.
 */
export function useSettledPress({
  onDown,
  onUp,
  onTap,
  isDisabled,
}: {
  onDown?: () => void;
  onUp?: () => void;
  onTap?: () => void;
  isDisabled?: boolean;
}) {
  const settling = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const down = useRef(false);
  // A touch that lifted before it settled: if React Aria then reports a completed press, it was a
  // tap, which is down and up at once. After a cancel (a scroll) it reports none.
  const liftedEarly = useRef(false);

  const goDown = () => {
    settling.current = undefined;
    down.current = true;
    onDown?.();
  };
  const stopSettling = () => {
    if (settling.current === undefined) return false;
    clearTimeout(settling.current);
    settling.current = undefined;
    return true;
  };
  useEffect(() => () => void stopSettling(), []);

  return usePress({
    isDisabled,
    onPressStart: (e: PressEvent) => {
      liftedEarly.current = false;
      if (e.pointerType === "touch") settling.current = setTimeout(goDown, TOUCH_SETTLE_MS);
      else goDown();
    },
    // Before onPress on a release; alone on a cancel.
    onPressEnd: () => {
      if (stopSettling()) {
        liftedEarly.current = true;
        return;
      }
      if (down.current) {
        down.current = false;
        onUp?.();
      }
    },
    onPress: () => {
      if (liftedEarly.current) {
        liftedEarly.current = false;
        onDown?.();
        onUp?.();
      }
      onTap?.();
    },
  });
}
