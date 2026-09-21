import type { Key } from "react-aria-components";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { cn } from "@/lib/utils";

/** A segmented control: exactly one of a few options is selected. */
export function ToggleGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
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
      {options.map((o) => (
        <ToggleButton
          key={o.id}
          id={o.id}
          className="h-8 cursor-pointer rounded-md px-3 text-sm font-medium text-muted-foreground outline-none data-[focus-visible]:ring-[3px] data-[focus-visible]:ring-ring/50 data-[hovered]:text-foreground data-[selected]:bg-background data-[selected]:text-foreground data-[selected]:shadow-sm"
        >
          {o.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
