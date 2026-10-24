// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import {
  Button as AriaButton,
  Link as AriaLink,
  composeRenderProps,
  type ButtonProps as AriaButtonProps,
  type LinkProps as AriaLinkProps,
} from "react-aria-components";
import { cn } from "@/lib/utils";
import { Titled } from "./titled";

const VARIANTS = {
  default: "bg-primary text-primary-foreground data-[hovered]:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground data-[hovered]:bg-secondary/80",
  outline: "border bg-background data-[hovered]:bg-accent",
  ghost: "data-[hovered]:bg-accent",
  /** Ghost, but muted until hovered: the header's secondary controls (install, Docs, GitHub). */
  subtle: "text-muted-foreground data-[hovered]:bg-accent data-[hovered]:text-foreground",
  destructive: "bg-destructive text-white data-[hovered]:bg-destructive/90",
} as const;

const SIZES = {
  default: "h-9 px-4 text-sm",
  // Still a comfortable touch target: 36px tall with generous padding.
  sm: "h-9 px-3 text-sm",
  icon: "size-9",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

/**
 * Every button's look, in one place: what a Button is drawn with, and what LinkButton borrows so a
 * link that looks like a button looks like exactly the same button. Shape and spacing come only
 * from here; a caller's className is for layout and colour (a tone), never another shape.
 */
export function buttonClass(variant: ButtonVariant = "default", size: ButtonSize = "default", className?: string) {
  return cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors outline-none select-none",
    "ring-focus data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
    "data-[pressed]:scale-[0.98]",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export interface ButtonProps extends AriaButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Native tooltip, for icon-only buttons whose label isn't visible. */
  title?: string;
}

/** A React Aria button (press handling that works for mouse, touch, pen and keyboard). */
export function Button({ variant = "default", size = "default", className, title, ...props }: ButtonProps) {
  const button = (
    <AriaButton
      {...props}
      className={composeRenderProps(className, (className) => buttonClass(variant, size, className))}
    />
  );
  return <Titled title={title}>{button}</Titled>;
}

export interface LinkButtonProps extends AriaLinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  title?: string;
}

/**
 * A link that looks like a button (Docs, the source on GitHub): React Aria's Link, which sets the
 * same hovered, pressed and focus-visible states a Button does, so the same rules draw it.
 */
export function LinkButton({ variant = "default", size = "default", className, title, ...props }: LinkButtonProps) {
  const link = (
    <AriaLink
      {...props}
      className={composeRenderProps(className, (className) => buttonClass(variant, size, className))}
    />
  );
  return <Titled title={title}>{link}</Titled>;
}
