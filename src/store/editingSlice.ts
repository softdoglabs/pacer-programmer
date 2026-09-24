import type { PacerConfig } from "../pacer/protocol/types";
import type { PacerStore } from "./pacerStore";

/*
 * The programming interface's editing state. Edits are pure functions on the config (see
 * src/pacer/editing) applied to the simulator's live config, so the faceplate previews them
 * immediately. The per-session parts (the saved baseline and undo history) live in the store's
 * `freshSession`, so opening another configuration resets them along with everything else.
 */

/**
 * Which top-level mode the app is in. Simulate and Program share the faceplate; the analysis
 * views planned in CLAUDE.md ("Planned UI reorganization") join this union as they're built.
 */
export type UiMode = "simulate" | "program";

export interface EditHistory {
  past: PacerConfig[];
  future: PacerConfig[];
}

export interface EditingSlice {
  /** Simulate: pressing a switch runs it. Program: pressing a switch selects it for editing, and nothing fires. */
  uiMode: UiMode;
  setUiMode: (mode: UiMode) => void;
  /** Applies one edit to the working config (undoable). A no-op edit (same config back) records nothing. */
  applyEdit: (edit: (config: PacerConfig) => PacerConfig) => void;
  undo: () => void;
  redo: () => void;
}

type Set = (partial: Partial<PacerStore> | ((s: PacerStore) => Partial<PacerStore>)) => void;
type Get = () => PacerStore;

const MAX_UNDO = 200;

/** Whether the working config differs from what was last opened or saved (edits are copy-on-write, so identity is enough). */
export function hasUnsavedEdits(s: Pick<PacerStore, "board" | "savedConfig">): boolean {
  return s.board.config !== s.savedConfig;
}

export function createEditingSlice(set: Set, get: Get): EditingSlice {
  const replaceConfig = (config: PacerConfig, history: EditHistory) =>
    set((s) => ({ board: { ...s.board, config }, editHistory: history }));

  return {
    uiMode: "simulate",
    // Entering Program mode starts from the faceplate: the control selected while simulating was
    // chosen by pressing it, which isn't a choice to program it.
    setUiMode: (uiMode) => {
      // Selecting the mode already in force is not a change: re-focusing the mode bar (or a
      // keyboard arrow landing back on it) must not close the control being programmed.
      if (uiMode === get().uiMode) return;
      set(uiMode === "program" ? { uiMode, selectedControlId: undefined } : { uiMode });
    },

    applyEdit: (edit) => {
      const { board, editHistory } = get();
      const next = edit(board.config);
      if (next === board.config) return;
      replaceConfig(next, { past: [...editHistory.past, board.config].slice(-MAX_UNDO), future: [] });
    },

    undo: () => {
      const { board, editHistory } = get();
      const previous = editHistory.past.at(-1);
      if (!previous) return;
      replaceConfig(previous, { past: editHistory.past.slice(0, -1), future: [board.config, ...editHistory.future] });
    },

    redo: () => {
      const { board, editHistory } = get();
      const [next, ...rest] = editHistory.future;
      if (!next) return;
      replaceConfig(next, { past: [...editHistory.past, board.config], future: rest });
    },
  };
}
