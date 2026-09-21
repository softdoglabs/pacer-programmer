import type { Key } from "react-aria-components";
import {
  Button,
  Header,
  Label,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Popover,
  Select as AriaSelect,
  SelectValue,
} from "react-aria-components";
import { cn } from "@/lib/utils";

export interface SelectOption {
  id: string;
  label: string;
}

/** Options shown under a group heading. */
export interface SelectGroup {
  title: string;
  options: SelectOption[];
}

const ITEM_CLASS =
  "cursor-pointer rounded px-3 py-2 text-sm outline-none data-[focused]:bg-accent data-[selected]:font-semibold";

function Item({ option }: { option: SelectOption }) {
  return (
    <ListBoxItem id={option.id} textValue={option.label} className={ITEM_CLASS}>
      {option.label}
    </ListBoxItem>
  );
}

/** A labeled, touch-friendly select (React Aria), for short option lists. */
export function Select({
  label,
  options,
  value,
  onChange,
  className,
  placeholder = "—",
  labelVisible = true,
}: {
  label: string;
  /** Flat options, or groups of options with headings. */
  options: SelectOption[] | SelectGroup[];
  labelVisible?: boolean;
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
      <Label className={labelVisible ? "text-muted-foreground" : "sr-only"}>{label}</Label>
      <Button className="flex h-9 max-w-56 min-w-24 cursor-pointer items-center justify-between gap-2 rounded-md border bg-card px-3 text-left outline-none data-[focus-visible]:ring-[3px] data-[focus-visible]:ring-ring/50">
        <SelectValue className="truncate data-[placeholder]:text-muted-foreground" />
        <span aria-hidden className="text-muted-foreground">
          ▾
        </span>
      </Button>
      <Popover className="min-w-[var(--trigger-width)] rounded-md border bg-popover p-1 shadow-lg">
        <ListBox className="max-h-80 overflow-auto outline-none">
          {options.map((o) =>
            "options" in o ? (
              <ListBoxSection key={o.title} id={o.title}>
                <Header className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">{o.title}</Header>
                {o.options.map((option) => (
                  <Item key={option.id} option={option} />
                ))}
              </ListBoxSection>
            ) : (
              <Item key={o.id} option={o} />
            ),
          )}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}
