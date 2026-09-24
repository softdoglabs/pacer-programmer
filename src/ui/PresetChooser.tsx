import { useMemo } from "react";
import {
  Button,
  Dialog,
  DialogTrigger,
  Header,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Popover,
} from "react-aria-components";
import { ChevronDown } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Titled } from "@/components/ui/titled";
import { cn } from "@/lib/utils";
import { changedPresets } from "../pacer/editing";
import {
  BANK_COUNT,
  CURRENT_PRESET_INDEX,
  PRESETS_PER_BANK,
  presetIndexToLabel,
  userPresetIndex,
} from "../pacer/protocol/constants";
import { usePacerStore } from "../store/pacerStore";

/*
 * Choosing a preset, from anywhere, without spending a panel on it. The trigger names the current
 * preset; the popover is the hardware's own 4x6 arrangement, so the grid you tap matches the banks
 * printed on the Pacer. This replaced a tab that showed the same 24 slots and nothing else.
 *
 * Jumping here is an app shortcut: the hardware needs a held [Preset] and two presses, which the
 * faceplate still does. What this can show that the hardware can't is which presets you've edited
 * and which no longer match the device.
 */

function presetName(name: string | undefined): string {
  return name?.trim() ? name : "—";
}

export function PresetChooser() {
  const index = usePacerStore((s) => s.board.activePresetIndex);
  const presets = usePacerStore((s) => s.board.config.presets);
  const jumpToPreset = usePacerStore((s) => s.jumpToPreset);
  const config = usePacerStore((s) => s.board.config);
  const savedConfig = usePacerStore((s) => s.savedConfig);
  const sendBaseline = usePacerStore((s) => s.sendBaseline);
  const hasCurrentSlot = usePacerStore(useShallow((s) => s.board.config.presets[CURRENT_PRESET_INDEX] !== undefined));

  // Edited since the configuration was opened, and differing from what the Pacer was last given.
  const edited = useMemo(() => new Set(changedPresets(savedConfig, config)), [savedConfig, config]);
  const unsent = useMemo(() => new Set(changedPresets(sendBaseline, config)), [sendBaseline, config]);

  const label = `${presetIndexToLabel(index)} · ${presetName(presets[index]?.name)}`;

  const cell = (slot: number) => {
    const marks = [edited.has(slot) && "edited", unsent.has(slot) && "not sent to the Pacer"].filter(Boolean);
    // The dots are the only sign of these states, so they're spelled out for the accessible name.
    const described = `${presetIndexToLabel(slot)} ${presetName(presets[slot]?.name)}${marks.length ? `, ${marks.join(", ")}` : ""}`;
    return (
      <ListBoxItem
        key={slot}
        id={String(slot)}
        aria-label={described}
        textValue={described}
        className={cn(
          "flex cursor-pointer items-baseline gap-2 rounded px-2 py-1.5 text-sm outline-none",
          "data-[focused]:bg-accent data-[selected]:bg-primary/20 data-[selected]:font-semibold",
        )}
      >
        <span className="w-6 shrink-0 tabular-nums">{presetIndexToLabel(slot)}</span>
        <span className="min-w-0 truncate font-mono text-xs whitespace-pre">{presetName(presets[slot]?.name)}</span>
        {/* One dot for "you changed it", hollow for "the Pacer hasn't got it yet". */}
        {edited.has(slot) && <span className="ml-auto text-primary">●</span>}
        {!edited.has(slot) && unsent.has(slot) && <span className="ml-auto text-muted-foreground">○</span>}
      </ListBoxItem>
    );
  };

  return (
    <DialogTrigger>
      <Titled title="Choose which preset the simulator is on">
        <Button
          aria-label={`Preset: ${label}`}
          className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm ring-focus outline-none data-[hovered]:bg-accent"
        >
          <span className="font-semibold tabular-nums">{presetIndexToLabel(index)}</span>
          <span className="font-mono text-xs whitespace-pre text-muted-foreground">
            {presetName(presets[index]?.name)}
          </span>
          <ChevronDown aria-hidden className="size-3.5 opacity-60" />
        </Button>
      </Titled>
      <Popover className="rounded-md border bg-popover p-2 shadow-lg">
        <Dialog aria-label={`Preset: ${label}`} className="outline-none">
          {({ close }) => (
            <ListBox
              aria-label="Presets"
              layout="grid"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[String(index)]}
              onSelectionChange={(keys) => {
                const [key] = keys as Set<string>;
                if (key !== undefined) jumpToPreset(Number(key));
                close();
              }}
              className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-x-3 outline-none"
            >
              {Array.from({ length: BANK_COUNT }, (_, bank) => (
                <ListBoxSection key={bank} id={`bank-${bank}`} className="flex flex-col">
                  <Header className="px-2 pb-1 text-xs font-medium text-muted-foreground">Bank {"ABCD"[bank]}</Header>
                  {Array.from({ length: PRESETS_PER_BANK }, (_, n) => cell(userPresetIndex(bank, n + 1)))}
                </ListBoxSection>
              ))}
              {hasCurrentSlot && (
                <ListBoxSection id="current" className="col-span-full flex flex-col border-t pt-1">
                  <Header className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                    The device's working copy of whatever preset is loaded — not a front-panel one
                  </Header>
                  {cell(CURRENT_PRESET_INDEX)}
                </ListBoxSection>
              )}
            </ListBox>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
