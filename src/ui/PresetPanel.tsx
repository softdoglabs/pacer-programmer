import { Button } from "@/components/ui/button";
import { nextFreePresetMidi, setPresetMidiType } from "../pacer/editing";
import { PRESET_MIDI_SETTINGS, PresetMidiMessageType, presetIndexToLabel } from "../pacer/protocol/constants";
import type { Preset } from "../pacer/protocol/types";
import { usePacerStore } from "../store/pacerStore";
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
  const preset = usePacerStore((s) => s.board.config.presets[index]);
  const applyEdit = usePacerStore((s) => s.applyEdit);
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
      {used.length === 0 ? (
        <p className="text-xs text-muted-foreground">This preset sends nothing when it loads.</p>
      ) : (
        <ul className="space-y-2">
          {used.map((n) => (
            <PresetMidiRow key={n} presetIndex={index} n={n} setting={preset.midiSettings[n]!} />
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
            applyEdit((c) => setPresetMidiType(c, index, nextFree, PresetMidiMessageType.ProgramAndBank))
          }
        >
          + Add message{nextFree === undefined ? ` (all ${PRESET_MIDI_SETTINGS} in use)` : ""}
        </Button>
        <span className="text-xs text-muted-foreground">
          Sent whenever this preset is recalled, by the hardware and by the simulator.
        </span>
      </div>
    </section>
  );
}
