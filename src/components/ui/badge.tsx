// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  outline: "text-foreground",
} as const;

/** A small static label (no behavior, so no library component needed). */
export function Badge({
  variant = "default",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof VARIANTS }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
