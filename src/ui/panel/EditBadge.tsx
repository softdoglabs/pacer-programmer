import { Pencil, PencilOff } from "lucide-react";
import { Button } from "react-aria-components";
import { cn } from "@/lib/utils";

const BADGE_CLASS = cn(
  "absolute -right-2.5 -bottom-2.5 z-10 flex size-9 cursor-pointer items-center justify-center",
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
export function EditBadge({ onPress, label, className }: { onPress?: () => void; label?: string; className?: string }) {
  const icon = <Pencil className="size-5" strokeWidth={2.5} />;
  if (!onPress) {
    return (
      <span aria-hidden className={cn(BADGE_CLASS, className)}>
        {icon}
      </span>
    );
  }
  return (
    <Button aria-label={label} className={cn(BADGE_CLASS, className)} onPress={onPress}>
      {icon}
    </Button>
  );
}

/** The counterpart for a control that can't be programmed at all ([Preset]): a struck-out pencil. */
export function NoEditBadge({ title }: { title?: string }) {
  return (
    <span
      aria-hidden
      title={title}
      className={cn(
        "absolute -right-2.5 -bottom-2.5 z-10 flex size-9 items-center justify-center",
        "rounded-full bg-black/80 text-destructive shadow-lg shadow-black/70 ring-2 ring-destructive",
      )}
    >
      <PencilOff className="size-5" strokeWidth={2.5} />
    </span>
  );
}
