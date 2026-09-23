import { Button as AriaButton, composeRenderProps, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { cn } from "@/lib/utils";

const VARIANTS = {
  default: "bg-primary text-primary-foreground data-[hovered]:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground data-[hovered]:bg-secondary/80",
  outline: "border bg-background data-[hovered]:bg-accent",
  ghost: "data-[hovered]:bg-accent",
  destructive: "bg-destructive text-white data-[hovered]:bg-destructive/90",
} as const;

const SIZES = {
  default: "h-9 px-4 text-sm",
  // Still a comfortable touch target: 36px tall with generous padding.
  sm: "h-9 px-3 text-sm",
  icon: "size-9",
} as const;

export interface ButtonProps extends AriaButtonProps {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Native tooltip, for icon-only buttons whose label isn't visible. */
  title?: string;
}

/** A React Aria button (press handling that works for mouse, touch, pen and keyboard). */
export function Button({ variant = "default", size = "default", className, ...props }: ButtonProps) {
  return (
    <AriaButton
      {...props}
      className={composeRenderProps(className, (className) =>
        cn(
          "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors outline-none select-none",
          "ring-focus data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
          "data-[pressed]:scale-[0.98]",
          VARIANTS[variant],
          SIZES[size],
          className,
        ),
      )}
    />
  );
}
