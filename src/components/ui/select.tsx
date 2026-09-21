import type { Key } from "react-aria-components";
import { Button, Label, ListBox, ListBoxItem, Popover, Select as AriaSelect, SelectValue } from "react-aria-components";
import { cn } from "@/lib/utils";

export interface SelectOption {
  id: string;
  label: string;
}

/** A labeled, touch-friendly select (React Aria), for short option lists. */
export function Select({
  label,
  options,
  value,
  onChange,
  className,
  placeholder = "—",
}: {
  label: string;
  options: SelectOption[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <AriaSelect
      className={cn("flex items-center gap-2 text-sm", className)}
      selectedKey={value ?? null}
      onSelectionChange={(key: Key | null) => onChange(key === null ? undefined : String(key))}
      placeholder={placeholder}
    >
      <Label className="text-muted-foreground">{label}</Label>
      <Button className="flex h-9 max-w-56 min-w-24 cursor-pointer items-center justify-between gap-2 rounded-md border bg-card px-3 text-left outline-none data-[focus-visible]:ring-[3px] data-[focus-visible]:ring-ring/50">
        <SelectValue className="truncate data-[placeholder]:text-muted-foreground" />
        <span aria-hidden className="text-muted-foreground">
          ▾
        </span>
      </Button>
      <Popover className="min-w-[var(--trigger-width)] rounded-md border bg-popover p-1 shadow-lg">
        <ListBox className="max-h-72 overflow-auto outline-none">
          {options.map((o) => (
            <ListBoxItem
              key={o.id}
              id={o.id}
              textValue={o.label}
              className="cursor-pointer rounded px-3 py-2 text-sm outline-none data-[focused]:bg-accent data-[selected]:font-semibold"
            >
              {o.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}
