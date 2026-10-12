// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Select, type SelectGroup } from "@/components/ui/select";
import { dependsOnEntry, presetEntrants } from "@/pacer/analysis";
import { clearablePresets } from "@/pacer/authoring";
import { isSparePreset } from "@/pacer/editing";
import { FIRST_USER_PRESET_INDEX, LAST_USER_PRESET_INDEX, presetIndexToLabel } from "@/pacer/protocol/constants";
import { usePacerStore } from "../../store/pacerStore";
import { useMachine } from "../useMachine";

/*
 * What a state is actually made of.
 *
 * The map draws a state as one thing, which is the point — but the presets behind it are real, they
 * have numbers on the hardware, and they landed wherever the app found room. This is where to look
 * at them: which slot each copy is in, which preset enters it, and where it goes back to.
 *
 * It's also where to move one. A looper's copies scattered through banks B and D work exactly as
 * well as three together in bank D, but only one of those is something you can find on the device
 * in a hurry, and nothing else in the app will follow the routes for you (see `movePreset`).
 */

export function StateDetails({ stateId, onClose }: { stateId: string; onClose: () => void }) {
  const config = usePacerStore((s) => s.board.config);
  const activeIndex = usePacerStore((s) => s.board.activePresetIndex);
  const jumpToPreset = usePacerStore((s) => s.jumpToPreset);
  const setUiMode = usePacerStore((s) => s.setUiMode);
  const movePresetToSlot = usePacerStore((s) => s.movePresetToSlot);
  // A move that's refused says why, here, rather than doing nothing where you were looking.
  const [refused, setRefused] = useState<string | undefined>();
  // A move into a preset that's in use, waiting to be agreed to: it clears that preset.
  const [clearing, setClearing] = useState<{ from: number; to: number } | undefined>();

  const machine = useMachine();
  const { name, members, comesBack } = useMemo(() => {
    const state = machine.states.find((s) => s.id === stateId);
    return {
      name: state?.name?.trim() || stateId,
      members: state ? (machine.members[state.id] ?? []) : [],
      comesBack: state ? dependsOnEntry(state) : false,
    };
  }, [machine, stateId]);

  const spare = useMemo(() => {
    const free = [];
    for (let i = FIRST_USER_PRESET_INDEX; i <= LAST_USER_PRESET_INDEX; i++) {
      if (isSparePreset(config.presets[i])) free.push({ id: String(i), label: presetIndexToLabel(i) });
    }
    return free;
  }, [config]);
  // With no empty preset — every device, until one's cleared — a move can clear one the machine
  // doesn't use, once that's agreed to (the same rule the route dialog offers copies by).
  const clearable = useMemo(() => clearablePresets(config, machine, [stateId]), [config, machine, stateId]);

  if (members.length === 0) return null;
  const label = (slot: number) => `${presetIndexToLabel(slot)} ${config.presets[slot]?.name?.trim() ?? ""}`.trim();
  const destinations = (slot: number): SelectGroup[] =>
    [
      { title: "Empty", options: spare.filter((o) => Number(o.id) !== slot) },
      { title: "In use — would be cleared", options: clearable.map((i) => ({ id: String(i), label: label(i) })) },
    ].filter((g) => g.options.length > 0);

  return (
    <section aria-label={`${name}: the presets it is`} className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">{name}</h2>
        <span className="text-xs text-muted-foreground">
          {members.length === 1
            ? "one preset"
            : `${members.length} presets, one state${comesBack ? " — one per place it comes back to" : ""}`}
        </span>
        <Button size="sm" variant="ghost" className="ml-auto" onPress={onClose}>
          Close
        </Button>
      </div>

      <ul className="space-y-1">
        {members.map((slot) => {
          const entrants = presetEntrants(config, slot);
          return (
            <li key={slot} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border px-2 py-1.5 text-sm">
              <span className={slot === activeIndex ? "font-semibold text-primary tabular-nums" : "tabular-nums"}>
                {presetIndexToLabel(slot)}
              </span>
              <span className="font-mono text-xs whitespace-pre text-muted-foreground">
                {config.presets[slot]?.name ?? ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {entrants.length === 0 ? "nothing leads here" : `entered from ${entrants.map(label).join(", ")}`}
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  title="Load this preset in the simulator"
                  onPress={() => jumpToPreset(slot)}
                >
                  Load
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Open this preset in Program mode"
                  onPress={() => {
                    jumpToPreset(slot);
                    setUiMode("program");
                  }}
                >
                  Program
                </Button>
                {/* Onto a preset in use is a delete, so it's listed apart and asked about first. */}
                <Select
                  label={`Move ${presetIndexToLabel(slot)} to`}
                  labelVisible={false}
                  placeholder="Move to…"
                  title={
                    destinations(slot).length === 0
                      ? "No empty presets to move into, and every other preset is part of a route — clear one in Program mode"
                      : "Move this preset to another slot, taking the routes that lead to it with it"
                  }
                  value={undefined}
                  options={destinations(slot)}
                  onChange={(id) => {
                    if (id === undefined) return;
                    const to = Number(id);
                    if (isSparePreset(config.presets[to])) setRefused(movePresetToSlot(slot, to));
                    else setClearing({ from: slot, to });
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <ModalDialog
        isOpen={clearing !== undefined}
        onOpenChange={(open) => !open && setClearing(undefined)}
        title={
          clearing
            ? `Clear ${presetIndexToLabel(clearing.to)} and move ${presetIndexToLabel(clearing.from)} there?`
            : ""
        }
      >
        {clearing && (
          <>
            <p className="text-sm">
              {label(clearing.to)} has something in it. Moving {label(clearing.from)} there clears it first: everything
              on {presetIndexToLabel(clearing.to)} is lost, and {presetIndexToLabel(clearing.from)} is left empty.
            </p>
            <p className="text-xs text-muted-foreground">
              Nothing reaches the Pacer until you send it, and one undo brings both back.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onPress={() => setClearing(undefined)}>
                Cancel
              </Button>
              <Button
                onPress={() => {
                  setRefused(movePresetToSlot(clearing.from, clearing.to, { clearFirst: true }));
                  setClearing(undefined);
                }}
              >
                Clear {presetIndexToLabel(clearing.to)} and move
              </Button>
            </div>
          </>
        )}
      </ModalDialog>
      {refused && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
          {refused}
        </p>
      )}
    </section>
  );
}
