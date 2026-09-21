import { presetIndexToLabel } from "../pacer/protocol/constants";
import { usePacerStore } from "../store/pacerStore";

export function PresetIndicator() {
  const board = usePacerStore((s) => s.board);
  const preset = board.config.presets[board.activePresetIndex];

  return (
    <div className="preset-indicator">
      <span className="preset-label">{presetIndexToLabel(board.activePresetIndex)}</span>
      {preset?.name && <span className="preset-name">{preset.name}</span>}
    </div>
  );
}
