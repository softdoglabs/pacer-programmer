// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { Checkbox } from "react-aria-components";
import { cn } from "@/lib/utils";

/** A tick-box with its label beside it (React Aria), big enough to hit on a tablet. */
export function Tick({
  isSelected,
  onChange,
  className,
  children,
}: {
  isSelected: boolean;
  onChange: (on: boolean) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Checkbox
      isSelected={isSelected}
      onChange={onChange}
      className={cn("group flex cursor-pointer items-start gap-2 text-xs", className)}
    >
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded border bg-card ring-focus group-data-[focus-visible]:outline group-data-[selected]:bg-primary group-data-[selected]:text-primary-foreground"
      >
        {isSelected ? "✓" : ""}
      </span>
      {children}
    </Checkbox>
  );
}
