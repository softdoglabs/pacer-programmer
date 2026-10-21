// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { LayoutGrid, Pencil, PencilOff } from "lucide-react";
import { Button } from "react-aria-components";
import { cn } from "@/lib/utils";
import { Titled } from "@/components/ui/titled";

const BADGE_CLASS = cn(
  // Offset by --badge-overhang, the same value `.badge-room` reserves (see index.css).
  "absolute z-10 right-[calc(-1*var(--badge-overhang))] bottom-[calc(-1*var(--badge-overhang))]",
  "flex size-9 cursor-pointer items-center justify-center",
  "rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/70 ring-2 ring-black/40",
  "outline-none data-[focus-visible]:ring-ring/50",
);

/**
 * Marks a control you can tap to program it (Edit mode). It overhangs the control's bottom-right
 * corner and carries a shadow, so it reads as an app affordance rather than part of the hardware.
 *
 * Inside a control that is itself a button, it's a plain element that takes pointer events, so a
 * click on the overhanging part still reaches that button. Where the control isn't a button (an
 * expression pedal, say), pass `onPress` and it becomes a button of its own.
 */
export function EditBadge({
  onPress,
  label,
  className,
  size = "default",
}: {
  onPress?: () => void;
  label?: string;
  className?: string;
  /**
   * "small" sits beside the thing it edits rather than on a control's corner. "inline" sits in a
   * line of text, a rounded square the size of the font rather than a disc, since it isn't on
   * hardware and needn't stand out from it. It's too small for a finger, so a pseudo-element
   * around it takes taps for 10px on every side.
   */
  size?: "default" | "small" | "inline";
}) {
  const badgeClass = cn(
    BADGE_CLASS,
    size === "small" && "size-6 shadow-md ring-1",
    size === "inline" &&
      "relative right-0 bottom-0 size-[1em] rounded-[3px] shadow-none ring-0 before:absolute before:-inset-2.5",
    className,
  );
  const icon = (
    <Pencil
      className={size === "inline" ? "size-[0.75em]" : size === "small" ? "size-3.5" : "size-5"}
      strokeWidth={2.5}
    />
  );
  if (!onPress) {
    return (
      <span aria-hidden title={label} className={badgeClass}>
        {icon}
      </span>
    );
  }
  return (
    <Titled title={label}>
      <Button aria-label={label} className={badgeClass} onPress={onPress}>
        {icon}
      </Button>
    </Titled>
  );
}

/** The counterpart for a control that can't be programmed at all ([Preset]): a struck-out pencil. */
export function NoEditBadge({ title }: { title?: string }) {
  return (
    <span
      aria-hidden
      title={title}
      className={cn(
        "absolute right-[calc(-1*var(--badge-overhang))] bottom-[calc(-1*var(--badge-overhang))] z-10",
        "flex size-9 items-center justify-center",
        "rounded-full bg-black/80 text-destructive shadow-lg shadow-black/70 ring-2 ring-destructive",
      )}
    >
      <PencilOff className="size-5" strokeWidth={2.5} />
    </span>
  );
}

/**
 * Marks the display as the way to change preset. It takes the display's bottom-right corner, the
 * same place every other programmable control carries its badge, so the faceplate has one habit.
 * A plain element: it sits inside the button that opens the chooser.
 */
export function PresetBadge() {
  return (
    <span aria-hidden className={BADGE_CLASS}>
      <LayoutGrid className="size-5" strokeWidth={2.5} />
    </span>
  );
}
