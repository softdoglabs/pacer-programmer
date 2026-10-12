// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { Button, Group, Input, Label, NumberField as AriaNumberField } from "react-aria-components";
import { cn } from "@/lib/utils";
import { Titled } from "./titled";

/** A labeled number input with −/+ steppers (touch-friendly; also accepts typing and arrow keys). */
export function NumberField({
  label,
  value,
  onChange,
  minValue = 0,
  maxValue = 127,
  className,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  minValue?: number;
  maxValue?: number;
  className?: string;
}) {
  return (
    <AriaNumberField
      className={cn("flex flex-col gap-1", className)}
      value={value}
      minValue={minValue}
      maxValue={maxValue}
      step={1}
      onChange={(v) => {
        if (!Number.isNaN(v)) onChange(v);
      }}
    >
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Group className="flex h-9 w-fit items-center overflow-hidden rounded-md border bg-card ring-focus">
        <Titled title={`${label}: one less (${minValue} is the lowest)`}>
          <Button slot="decrement" className="h-full w-9 cursor-pointer text-lg outline-none data-[pressed]:bg-accent">
            −
          </Button>
        </Titled>
        <Input
          inputMode="numeric"
          className="h-full w-12 border-x bg-transparent text-center text-sm tabular-nums outline-none"
        />
        <Titled title={`${label}: one more (${maxValue} is the highest)`}>
          <Button slot="increment" className="h-full w-9 cursor-pointer text-lg outline-none data-[pressed]:bg-accent">
            +
          </Button>
        </Titled>
      </Group>
    </AriaNumberField>
  );
}
