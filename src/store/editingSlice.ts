import { machineOf, stateContaining } from "../pacer/analysis";
import { movePreset } from "../pacer/authoring";
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
export type UiMode = "simulate" | "program" | "map";

export interface EditHistory {
  past: PacerConfig[];
  future: PacerConfig[];
}

/**
 * What an edit made in the editor applies to.
 *
 * A state can be several presets — one per place it comes back to — and the map draws them as one
 * thing. Opening one from there and changing it alone is how a state quietly comes apart, so
 * "state" is the default: the same change goes to every preset the state is, which is the sync
 * work this project exists to remove. "preset" is the deliberate way to make one copy differ.
 */
export type EditScope = "state" | "preset";

/** The presets an edit applies to: every preset the current one behaves like, or just it. */
export function editTargets(config: PacerConfig, presetIndex: number, scope: EditScope): number[] {
  if (scope === "preset") return [presetIndex];
  const members = stateContaining(machineOf(config), presetIndex)?.members ?? [];
  return members.length > 0 ? members : [presetIndex];
}

export interface EditingSlice {
  /** Simulate: pressing a switch runs it. Program: pressing a switch selects it for editing, and nothing fires. */
  uiMode: UiMode;
  setUiMode: (mode: UiMode) => void;
  /** Applies one edit to the working config (undoable). A no-op edit (same config back) records nothing. */
  applyEdit: (edit: (config: PacerConfig) => PacerConfig) => void;
  /**
   * Applies one edit to each preset in scope — every preset the current one behaves like, or just
   * the current one — as a single undoable step. Everything the editor changes about a preset goes
   * through here, so the copies of a state can't drift apart by accident.
   */
  applyPresetEdit: (edit: (config: PacerConfig, presetIndex: number) => PacerConfig) => void;
  editScope: EditScope;
  setEditScope: (scope: EditScope) => void;
  /**
   * Moves a preset to an empty slot, taking every route that named it along (see `movePreset`).
   * Returns why it couldn't, or undefined when it did — a refusal has to reach whoever asked.
   */
  movePresetToSlot: (from: number, to: number) => string | undefined;
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

    editScope: "state",
    setEditScope: (editScope) => set({ editScope }),

    movePresetToSlot: (from, to) => {
      const { board, applyEdit } = get();
      const result = movePreset(board.config, from, to);
      if (!result.ok) return result.error;
      applyEdit(() => result.config);
      /*
       * The preset didn't change, its number did. Left alone, the simulator would sit on the slot
       * just emptied — a preset that now does nothing, presented as the one you were editing. It
       * follows quietly rather than through a recall: nothing was selected, so nothing should fire.
       */
      if (board.activePresetIndex === from) {
        set((s) => ({ board: { ...s.board, activePresetIndex: to } }));
      }
      return undefined;
    },

    applyPresetEdit: (edit) => {
      const { board, editScope, applyEdit } = get();
      const targets = editTargets(board.config, board.activePresetIndex, editScope);
      // One undo step, however many presets it touched: it was one change to one thing.
      applyEdit((config) => targets.reduce((acc, presetIndex) => edit(acc, presetIndex), config));
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
