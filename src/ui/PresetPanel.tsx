import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { presetEntrants } from "../pacer/authoring";
import { clearPreset, isSparePreset, nextFreePresetMidi, setPresetMidiType, SPARE_PRESET_NAME } from "../pacer/editing";
import { PRESET_MIDI_SETTINGS, PresetMidiMessageType, presetIndexToLabel } from "../pacer/protocol/constants";
import type { Preset } from "../pacer/protocol/types";
import { usePacerStore } from "../store/pacerStore";
import { useStateOfPreset } from "./useMachine";
import { PresetMidiRow } from "./editor/PresetMidiRow";

/**
 * The preset's own settings, as opposed to any one switch's: the MIDI it sends when it loads. It
 * belongs beside the faceplate in Program mode, where the preset's name is also edited — this is
 * preset-level configuration, not something a control owns.
 *
 * There is no counterpart for leaving a preset. The User Guide documents this hook alone, and the
 * way to act on the way out is a step on the switch that leaves, firing in the same press as its
 * Preset Select.
 */
function loadMessages(preset: Preset): number[] {
  return Object.entries(preset.midiSettings)
    .filter(([, s]) => s !== undefined && s.msgType !== PresetMidiMessageType.Off)
    .map(([n]) => Number(n))
    .sort((a, b) => a - b);
}

export function PresetPanel() {
  const index = usePacerStore((s) => s.board.activePresetIndex);
  const config = usePacerStore((s) => s.board.config);
  const preset = config.presets[index];
  const applyEdit = usePacerStore((s) => s.applyEdit);
  const applyPresetEdit = usePacerStore((s) => s.applyPresetEdit);
  const scope = usePacerStore((s) => s.editScope);
  const [clearing, setClearing] = useState(false);
  /*
   * The presets this one behaves like. Editing one of them here changes that preset alone, which
   * is how a state stops being one — worth saying, since the map presents them as a single thing
   * and this is where you arrive from it.
   */
  const alike = useStateOfPreset();
  // Only worked out while the confirm is open: it's a question about this one preset.
  const entrants = clearing ? presetEntrants(config, index) : [];
  const presetLabel = (slot: number) =>
    `${presetIndexToLabel(slot)}${config.presets[slot]?.name?.trim() ? ` ${config.presets[slot]!.name!.trim()}` : ""}`;
  if (!preset) return null;

  const used = loadMessages(preset);
  const nextFree = nextFreePresetMidi(preset);

  return (
    <section aria-label="Preset settings" className="space-y-2 rounded-lg border bg-card p-3">
      <h2 className="text-sm font-semibold">
        {presetIndexToLabel(index)} — MIDI sent on load
        <span className="ml-2 font-mono text-xs font-normal whitespace-pre text-muted-foreground">
          {preset.name ?? "(unnamed)"}
        </span>
      </h2>
      {alike.members.length > 1 && (
        <p className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
          {presetIndexToLabel(index)} is one of {alike.members.length} presets that behave alike —{" "}
          {alike.name ? `“${alike.name}”` : "one state"} on the map ({alike.members.map(presetIndexToLabel).join(", ")}
          ).{" "}
          {scope === "state"
            ? "Changes here go to all of them, so they stay one state. Where each one jumps is its own, and the map edits that."
            : "Changes here go to this preset alone, so it stops behaving like the others. The bar above switches back."}
        </p>
      )}
      {used.length === 0 ? (
        <p className="text-xs text-muted-foreground">This preset sends nothing when it loads.</p>
      ) : (
        <ul className="space-y-2">
          {used.map((n) => (
            <PresetMidiRow key={n} n={n} setting={preset.midiSettings[n]!} />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          isDisabled={nextFree === undefined}
          title={
            nextFree === undefined
              ? `All ${PRESET_MIDI_SETTINGS} messages are in use`
              : "Send one more message when this preset loads"
          }
          onPress={() =>
            nextFree !== undefined &&
            applyPresetEdit((c, i) => setPresetMidiType(c, i, nextFree, PresetMidiMessageType.ProgramAndBank))
          }
        >
          + Add message{nextFree === undefined ? ` (all ${PRESET_MIDI_SETTINGS} in use)` : ""}
        </Button>
        <span className="text-xs text-muted-foreground">
          Sent whenever this preset is recalled, by the hardware and by the simulator.
        </span>
      </div>

      {/*
       * Emptying a preset is how the device gets a slot to spare. It has none of its own: all 24
       * hold whatever they were last given, so a state that comes back — which needs a preset per
       * place it's entered from — has nowhere to put its next copy until something is cleared.
       */}
      <div className="flex flex-wrap items-center gap-3 border-t pt-2">
        <Button
          size="sm"
          variant="outline"
          isDisabled={isSparePreset(preset)}
          title={
            isSparePreset(preset)
              ? "There's nothing in this preset already"
              : "Empty this preset: every switch, and the MIDI it sends when it loads"
          }
          onPress={() => setClearing(true)}
        >
          Clear preset…
        </Button>
        <span className="text-xs text-muted-foreground">
          {isSparePreset(preset)
            ? "Empty, so a state that comes back can take this slot for a copy."
            : `Empties it and names it ${SPARE_PRESET_NAME}, freeing the slot for a copy of a state that comes back.`}
        </span>
      </div>

      <ModalDialog isOpen={clearing} onOpenChange={setClearing} title={`Clear ${presetIndexToLabel(index)}?`}>
        <p className="text-sm">
          Every switch on {presetIndexToLabel(index)} “{preset.name?.trim() || "unnamed"}” stops doing anything, and so
          does the MIDI it sends when it loads. It's named {SPARE_PRESET_NAME} so the slot reads as free, here and on
          the Pacer's own display.
        </p>
        {/*
         * Warned, not refused: emptying a slot before rerouting what led to it is a perfectly good
         * order to do things in. But a switch that jumps here would afterwards land on a preset
         * that does nothing, and the only way to find that out on the hardware is to press it.
         */}
        {clearing && entrants.length > 0 && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            {entrants.map(presetLabel).join(", ")} {entrants.length === 1 ? "jumps" : "jump"} here, and would land on an
            empty preset. Reroute {entrants.length === 1 ? "it" : "them"} on the map, before or after.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Nothing reaches the Pacer until you send it, and this is undoable until then.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onPress={() => setClearing(false)}>
            Cancel
          </Button>
          <Button
            onPress={() => {
              applyEdit((c) => clearPreset(c, index));
              setClearing(false);
            }}
          >
            Clear it
          </Button>
        </div>
      </ModalDialog>
    </section>
  );
}
