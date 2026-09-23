import type { ReactNode } from "react";

/**
 * Gives its child a native tooltip. React Aria filters props it doesn't recognize out of the
 * rendered element, so `title` set on any of its components never reaches the DOM; a wrapper
 * carries it instead. `display: contents` means the wrapper generates no box, so it can't disturb
 * the layout it sits in — and because a disabled control sets `pointer-events: none`, the tooltip
 * still shows there, which is exactly when "why can't I click this?" gets asked.
 *
 * The accessible name always comes from `aria-label` or a `<Label>`; this is only the hover hint.
 */
export function Titled({ title, children }: { title?: string; children: ReactNode }) {
  if (!title) return <>{children}</>;
  return (
    <span title={title} className="contents">
      {children}
    </span>
  );
}
