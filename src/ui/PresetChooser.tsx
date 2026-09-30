import { useMemo, useState } from "react";
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
import { ToggleGroup } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { recoverMachine } from "../pacer/analysis";
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
 * faceplate still does. What this can show that the hardware can't is which presets you've edited,
 * which no longer match the device, and which are copies of one state.
 *
 * **Two ways to read the same 24 slots.** By bank is where they live — the order printed on the
 * Pacer, and what you need when you're standing in front of it. By state is what they mean: a
 * looper entered from three places is three slots the app chose and one thing the user designed.
 * Neither is a view of something else, so both are offered rather than one being "advanced".
 */

function presetName(name: string | undefined): string {
  return name?.trim() ? name : "—";
}

type Arrangement = "banks" | "states";

export function PresetChooser({ trigger }: { trigger: React.ReactNode }) {
  const index = usePacerStore((s) => s.board.activePresetIndex);
  const presets = usePacerStore((s) => s.board.config.presets);
  const jumpToPreset = usePacerStore((s) => s.jumpToPreset);
  const config = usePacerStore((s) => s.board.config);
  const savedConfig = usePacerStore((s) => s.savedConfig);
  const sendBaseline = usePacerStore((s) => s.sendBaseline);
  const hasCurrentSlot = usePacerStore(useShallow((s) => s.board.config.presets[CURRENT_PRESET_INDEX] !== undefined));
  const [arrangement, setArrangement] = useState<Arrangement>("banks");

  /** The states this configuration's presets make up, the ones with copies first. */
  const states = useMemo(() => {
    const machine = recoverMachine(config);
    const groups = machine.states.map((state) => ({
      id: state.id,
      name: state.name?.trim() || state.id,
      members: machine.members[state.id] ?? [],
    }));
    const shared = groups.filter((g) => g.members.length > 1).sort((a, b) => b.members.length - a.members.length);
    const alone = groups
      .filter((g) => g.members.length === 1)
      .flatMap((g) => g.members)
      .sort((a, b) => a - b);
    return { shared, alone, of: new Map(groups.flatMap((g) => g.members.map((m) => [m, g] as const))) };
  }, [config]);

  // Edited since the configuration was opened, and differing from what the Pacer was last given.
  const edited = useMemo(() => new Set(changedPresets(savedConfig, config)), [savedConfig, config]);
  const unsent = useMemo(() => new Set(changedPresets(sendBaseline, config)), [sendBaseline, config]);

  const label = `${presetIndexToLabel(index)} · ${presetName(presets[index]?.name)}`;
  const pick = (slot: number, close: () => void) => {
    jumpToPreset(slot);
    close();
  };

  const cell = (slot: number) => {
    const marks = [edited.has(slot) && "edited", unsent.has(slot) && "not sent to the Pacer"].filter(Boolean);
    // The dots are the only sign of these states, so they're spelled out for the accessible name.
    const described = `${presetIndexToLabel(slot)} ${presetName(presets[slot]?.name)}${marks.length ? `, ${marks.join(", ")}` : ""}`;
    const state = states.of.get(slot);
    const copies = state && state.members.length > 1 ? state.members : undefined;
    return (
      <ListBoxItem
        key={slot}
        id={String(slot)}
        aria-label={copies ? `${described}, one of ${copies.length} presets of ${state!.name}` : described}
        textValue={described}
        className={cn(
          "flex cursor-pointer items-baseline gap-2 rounded px-2 py-1.5 text-sm outline-none",
          "data-[focused]:bg-accent data-[selected]:bg-primary/20 data-[selected]:font-semibold",
        )}
      >
        <span className="w-6 shrink-0 tabular-nums">{presetIndexToLabel(slot)}</span>
        <span className="min-w-0 truncate font-mono text-xs whitespace-pre">{presetName(presets[slot]?.name)}</span>
        {/* Copies of one state: which slots they are is the app's bookkeeping, but not a secret. */}
        {copies && (
          <span
            aria-hidden
            title={`One of ${copies.length} presets of ${state!.name}: ${copies.map(presetIndexToLabel).join(", ")}`}
            className="shrink-0 rounded bg-primary/20 px-1 text-[10px] font-semibold text-primary"
          >
            ×{copies.length}
          </span>
        )}
        {/* One dot for "you changed it", hollow for "the Pacer hasn't got it yet". */}
        {edited.has(slot) && <span className="ml-auto text-primary">●</span>}
        {!edited.has(slot) && unsent.has(slot) && <span className="ml-auto text-muted-foreground">○</span>}
      </ListBoxItem>
    );
  };

  return (
    <DialogTrigger>
      {trigger}
      <Popover className="rounded-md border bg-popover p-2 shadow-lg">
        <Dialog aria-label={`Preset: ${label}`} className="outline-none">
          {({ close }) => (
            <div className="space-y-2">
              <ToggleGroup<Arrangement>
                label="Arrange"
                labelVisible
                options={[
                  { id: "banks", label: "By bank", title: "The order printed on the Pacer" },
                  {
                    id: "states",
                    label: "By state",
                    title: "Presets that behave alike, grouped as the map draws them",
                  },
                ]}
                value={arrangement}
                onChange={setArrangement}
              />
              <ListBox
                aria-label="Presets"
                layout="grid"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[String(index)]}
                onSelectionChange={(keys) => {
                  const [key] = keys as Set<string>;
                  if (key !== undefined) pick(Number(key), close);
                }}
                /*
                 * Picking the preset already loaded is not a selection change, so nothing would
                 * report it — but it still means something, because a recall re-fires the preset's
                 * load-time MIDI. `onAction` covers that one case; a different preset is a real
                 * selection change and is handled above, so neither fires twice.
                 */
                onAction={(key) => Number(key) === index && pick(Number(key), close)}
                className={cn(
                  "gap-x-3 outline-none",
                  arrangement === "banks" ? "grid grid-cols-[repeat(4,minmax(0,1fr))]" : "flex flex-col",
                )}
              >
                {arrangement === "banks" ? (
                  Array.from({ length: BANK_COUNT }, (_, bank) => (
                    <ListBoxSection key={bank} id={`bank-${bank}`} className="flex flex-col">
                      <Header className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                        Bank {"ABCD"[bank]}
                      </Header>
                      {Array.from({ length: PRESETS_PER_BANK }, (_, n) => cell(userPresetIndex(bank, n + 1)))}
                    </ListBoxSection>
                  ))
                ) : (
                  <>
                    {states.shared.map((state) => (
                      <ListBoxSection key={state.id} id={`state-${state.id}`} className="flex flex-col">
                        <Header className="px-2 pt-1 pb-1 text-xs font-medium text-primary">
                          {state.name} — {state.members.length} presets, one state
                        </Header>
                        {state.members.map((slot) => cell(slot))}
                      </ListBoxSection>
                    ))}
                    {/* The items have to be the section's own children: anything wrapped around
                        them isn't part of the collection, and React Aria drops it. */}
                    <ListBoxSection id="alone" className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-x-3">
                      <Header className="col-span-full px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                        {states.shared.length > 0 ? "One preset each" : "Nothing here shares a state"}
                      </Header>
                      {states.alone.map((slot) => cell(slot))}
                    </ListBoxSection>
                  </>
                )}
                {hasCurrentSlot && (
                  <ListBoxSection id="current" className="col-span-full flex flex-col border-t pt-1">
                    <Header className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                      The device's working copy of whatever preset is loaded — not a front-panel one
                    </Header>
                    {cell(CURRENT_PRESET_INDEX)}
                  </ListBoxSection>
                )}
              </ListBox>
            </div>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

/** The chooser as a labelled button, for places with room for one (the switch editor's header). */
export function PresetChooserButton() {
  const index = usePacerStore((s) => s.board.activePresetIndex);
  const name = usePacerStore((s) => s.board.config.presets[s.board.activePresetIndex]?.name);
  return (
    <PresetChooser
      trigger={
        <Titled title="Choose a preset">
          <Button
            aria-label={`Preset: ${presetIndexToLabel(index)} ${presetName(name)} — choose another`}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm ring-focus outline-none data-[hovered]:bg-accent"
          >
            <span className="font-semibold tabular-nums">{presetIndexToLabel(index)}</span>
            <span className="font-mono text-xs whitespace-pre text-muted-foreground">{presetName(name)}</span>
            <ChevronDown aria-hidden className="size-3.5 opacity-60" />
          </Button>
        </Titled>
      }
    />
  );
}
