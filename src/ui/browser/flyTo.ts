// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/*
 * A closing panel shrinking into the button that reopens it, so you see where it went. A stand-in
 * the panel's size and colour is drawn over the page and animated, which leaves the dialog itself
 * to close the ordinary way. With reduced motion asked for, only the button's ring shows.
 */

export const FLY_MS = 450;

export function flyTo(from: Element | null, to: Element | null) {
  if (!to) return;
  const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const start = from?.getBoundingClientRect();
  const end = to.getBoundingClientRect();
  if (!reduce && start && start.width > 0 && typeof document.body.animate === "function") {
    const ghost = document.createElement("div");
    ghost.setAttribute("aria-hidden", "true");
    const style = getComputedStyle(from!);
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${start.left}px`,
      top: `${start.top}px`,
      width: `${start.width}px`,
      height: `${start.height}px`,
      background: style.backgroundColor,
      border: style.border,
      borderRadius: style.borderRadius,
      zIndex: "60",
      pointerEvents: "none",
      transformOrigin: "top left",
    });
    document.body.append(ghost);
    const dx = end.left + end.width / 2 - (start.left + start.width / 2);
    const dy = end.top + end.height / 2 - (start.top + start.height / 2);
    const scale = Math.max(end.width / start.width, 0.02);
    ghost
      .animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1, borderRadius: style.borderRadius },
          {
            transform: `translate(${dx + (start.width * (1 - scale)) / 2}px, ${dy + (start.height * (1 - scale)) / 2}px) scale(${scale})`,
            opacity: 0.3,
            borderRadius: "50%",
          },
        ],
        { duration: FLY_MS, easing: "cubic-bezier(0.4, 0, 0.6, 1)" },
      )
      .finished.finally(() => ghost.remove());
  }
  // The button takes a ring as it lands, so the eye ends up on it.
  to.animate?.([{ boxShadow: "0 0 0 0 var(--color-warning)" }, { boxShadow: "0 0 0 8px transparent" }], {
    duration: 700,
    delay: reduce ? 0 : FLY_MS - 50,
    easing: "ease-out",
  });
}
