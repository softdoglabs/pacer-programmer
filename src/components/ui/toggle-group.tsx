import type { Key } from "react-aria-components";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { cn } from "@/lib/utils";
import { Titled } from "./titled";

/** A segmented control: exactly one of a few options is selected. */
export function ToggleGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  labelVisible = false,
  selectOnFocus = false,
}: {
  label: string;
  options: readonly { id: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Shows the label beside the buttons, for groups whose options don't name what they set. */
  labelVisible?: boolean;
  /**
   * Selects whatever the arrow keys move focus to, which is how a radio group is expected to
   * behave. Off by default: React Aria moves focus without selecting, and ARIA allows that when
   * selecting has a side effect worth confirming — every group here that writes a config edit
   * would otherwise record one undo entry per arrow press.
   */
  selectOnFocus?: boolean;
}) {
  const group = (
    <ToggleButtonGroup
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys: Set<Key>) => {
        const [key] = keys;
        if (key !== undefined) onChange(String(key) as T);
      }}
      className={cn("inline-flex w-fit rounded-lg bg-muted p-[3px]", className)}
    >
      {options.map((o) => {
        const button = (
          <ToggleButton
            key={o.id}
            id={o.id}
            onFocus={selectOnFocus ? () => onChange(o.id) : undefined}
            className="h-8 cursor-pointer rounded-md px-3 text-sm font-medium text-muted-foreground outline-none ring-focus ring-focus-inset data-[hovered]:text-foreground data-[selected]:bg-background data-[selected]:text-foreground data-[selected]:shadow-sm"
          >
            {o.label}
          </ToggleButton>
        );
        return (
          <Titled key={o.id} title={o.title}>
            {button}
          </Titled>
        );
      })}
    </ToggleButtonGroup>
  );
  if (!labelVisible) return group;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* The group already carries `label` as its accessible name, so this copy is decoration. */}
      <span aria-hidden className="text-sm text-muted-foreground">
        {label}
      </span>
      {group}
    </div>
  );
}
