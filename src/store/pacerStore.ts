import { create } from "zustand";
import type { PacerConfig } from "../pacer/protocol/types";
import {
  applyBoardEvent,
  buildDemoConfig,
  createBoardState,
  formatBoardEffect,
  type BoardState,
  type ControlPhase,
} from "../pacer/simulator";

export interface LogEntry {
  id: number;
  controlId: number;
  phase: ControlPhase;
  lines: string[];
}

interface PacerStore {
  board: BoardState;
  log: LogEntry[];
  press: (controlId: number) => void;
  release: (controlId: number) => void;
  loadConfig: (config: PacerConfig, initialPresetIndex?: number) => void;
}

const MAX_LOG_ENTRIES = 200;

function handleEvent(controlId: number, phase: ControlPhase) {
  return (state: PacerStore): Partial<PacerStore> => {
    const { board, effect } = applyBoardEvent(state.board, { controlId, phase });
    const lines = formatBoardEffect(effect);
    if (lines.length === 0) return { board };
    const entry: LogEntry = { id: state.log.length, controlId, phase, lines };
    return { board, log: [...state.log, entry].slice(-MAX_LOG_ENTRIES) };
  };
}

export const usePacerStore = create<PacerStore>((set) => ({
  board: createBoardState(buildDemoConfig(), 0),
  log: [],
  press: (controlId) => set(handleEvent(controlId, "press")),
  release: (controlId) => set(handleEvent(controlId, "release")),
  loadConfig: (config, initialPresetIndex = 0) => set({ board: createBoardState(config, initialPresetIndex), log: [] }),
}));
