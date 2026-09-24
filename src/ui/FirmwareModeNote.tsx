import type { DeviceMode } from "../pacer/device";
import { presetIndexToLabel } from "../pacer/protocol/constants";
import { usePacerStore } from "../store/pacerStore";

/**
 * What's on screen when the firmware has taken over the panel. These presets aren't in the config
 * — the board still holds the last user preset underneath, which is what [Preset] returns to — so
 * without saying it, the faceplate looks like a preset whose switches can't be found anywhere.
 */
const NOTES: Partial<Record<DeviceMode, string>> = {
  presetSelect: "Preset select is active: A-D pick a bank, 1-6 load a preset, [Preset] cancels.",
  track: "The built-in Track preset (DAW control) is active. Its switches are fixed by the firmware, not the config.",
  transport:
    "The built-in Transport preset (DAW control) is active. Its switches are fixed by the firmware, not the config.",
};

export function FirmwareModeNote() {
  const mode = usePacerStore((s) => s.deviceMode.mode);
  const index = usePacerStore((s) => s.board.activePresetIndex);
  const note = NOTES[mode];
  if (!note) return null;
  return (
    <p className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
      {note} [Preset] returns to {presetIndexToLabel(index)}.
    </p>
  );
}
