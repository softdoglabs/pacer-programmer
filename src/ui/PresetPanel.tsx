import { presetIndexToLabel } from "../pacer/protocol/constants";
import type { Preset } from "../pacer/protocol/types";
import { channelLabel, presetMidiTypeName } from "../pacer/simulator";
import { usePacerStore } from "../store/pacerStore";

/**
 * The preset's own settings, as opposed to any one switch's: the MIDI it sends when it loads. It
 * belongs beside the faceplate in Program mode, where the preset's name is also edited — this is
 * preset-level configuration, not something a control owns.
 *
 * Read-only for now. Editing these isn't built (see CLAUDE.md), and the simulator doesn't fire
 * them on a preset change either, so the panel says so rather than implying they do nothing.
 */
function LoadTimeMidi({ preset }: { preset: Preset }) {
  const settings = Object.entries(preset.midiSettings)
    .map(([n, s]) => [Number(n), s] as const)
    .filter(([, s]) => s !== undefined && presetMidiTypeName(s.msgType) !== "Off")
    .sort(([a], [b]) => a - b);

  if (settings.length === 0) {
    return <p className="text-xs text-muted-foreground">This preset sends nothing when it loads.</p>;
  }
  return (
    <>
      <ul className="space-y-0.5 font-mono text-xs">
        {settings.map(([n, s]) => (
          <li key={n}>
            #{n} {presetMidiTypeName(s!.msgType)} ch {channelLabel(s!.channel)} [{s!.data.join(", ")}]
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Sent by the hardware when the preset loads. Not editable yet, and the simulator doesn't fire them on a preset
        change.
      </p>
    </>
  );
}

export function PresetPanel() {
  const index = usePacerStore((s) => s.board.activePresetIndex);
  const preset = usePacerStore((s) => s.board.config.presets[index]);
  if (!preset) return null;

  return (
    <section aria-label="Preset settings" className="space-y-1.5 rounded-lg border bg-card p-3">
      <h2 className="text-sm font-semibold">
        {presetIndexToLabel(index)} — MIDI sent on load
        <span className="ml-2 font-mono text-xs font-normal whitespace-pre text-muted-foreground">
          {preset.name ?? "(unnamed)"}
        </span>
      </h2>
      <LoadTimeMidi preset={preset} />
    </section>
  );
}
