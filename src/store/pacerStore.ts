import { createActor, type SnapshotFrom } from "xstate";
import { create } from "zustand";
import { STOMPSWITCH_IDS, deviceModeMachine, type DeviceMode } from "../pacer/device";
import { FIRST_USER_PRESET_INDEX, presetBank, presetIndexToLabel } from "../pacer/protocol/constants";
import { loadFactoryDefaults } from "../pacer/factoryDefaults";
import type { PacerConfig } from "../pacer/protocol/types";
import {
  applyBoardEvent,
  controlLabel,
  createBoardState,
  formatBoardEffect,
  type BoardState,
  type ControlPhase,
} from "../pacer/simulator";

export interface LogEntry {
  id: number;
  title: string;
  lines: string[];
  kind: "control" | "firmware" | "app";
}

export interface DeviceModeView {
  mode: DeviceMode;
  /** Only meaningful in `presetSelect` mode. */
  pendingBank: number;
  presetButtonDown: boolean;
}

interface PacerStore {
  /**
   * The loaded config and the current *user* preset. While a firmware special preset (preset
   * select, Track, Transport) is active, this still points at the last user preset: that's what
   * [Preset] returns to.
   */
  board: BoardState;
  /** Where the loaded config came from, for display ("Factory defaults", a file name, ...). */
  configSource: string;
  log: LogEntry[];
  deviceMode: DeviceModeView;
  /**
   * Controls whose next release must not reach the engine: their press was handled by a
   * firmware special preset, or it changed the preset.
   */
  swallowedReleases: number[];
  selectedControlId?: number;
  press: (controlId: number) => void;
  release: (controlId: number) => void;
  /** [Preset] is a tap-vs-hold switch (see deviceModeMachine.ts), so it needs both edges. */
  presetButtonDown: () => void;
  presetButtonUp: () => void;
  /** Direct jump from the app's preset list: not something the hardware itself can do in one action. */
  jumpToPreset: (index: number) => void;
  selectControl: (controlId: number | undefined) => void;
  loadConfig: (config: PacerConfig, source: string, initialPresetIndex?: number) => void;
  clearLog: () => void;
}

const MAX_LOG_ENTRIES = 200;
let nextLogId = 0;

function appendLog(log: LogEntry[], entry: Omit<LogEntry, "id">): LogEntry[] {
  return [...log, { ...entry, id: nextLogId++ }].slice(-MAX_LOG_ENTRIES);
}

function toDeviceModeView(snapshot: SnapshotFrom<typeof deviceModeMachine>): DeviceModeView {
  return {
    mode: snapshot.value.mode as DeviceMode,
    pendingBank: snapshot.context.pendingBank,
    presetButtonDown: snapshot.value.presetButton !== "up",
  };
}

function withPreset(board: BoardState, index: number): BoardState {
  return createBoardState(board.config, index);
}

const MODE_TITLES: Record<DeviceMode, string> = {
  user: "Preset",
  presetSelect: "Preset select",
  track: "Track preset",
  transport: "Transport preset",
};

export const usePacerStore = create<PacerStore>((set, get) => {
  const firmwareLog = (title: string, line: string) =>
    set((s) => ({ log: appendLog(s.log, { kind: "firmware", title, lines: [line] }) }));

  const machine = deviceModeMachine.provide({
    actions: {
      loadPreset: (_, { index }) =>
        set((s) => ({
          board: withPreset(s.board, index),
          log: appendLog(s.log, {
            kind: "firmware",
            title: "Preset select",
            lines: [`Preset changed: ${presetIndexToLabel(s.board.activePresetIndex)} -> ${presetIndexToLabel(index)}`],
          }),
        })),
      returnToLastPreset: () =>
        set((s) => ({
          board: withPreset(s.board, s.board.activePresetIndex),
          log: appendLog(s.log, {
            kind: "firmware",
            title: "Preset button",
            lines: [`Returned to last preset ${presetIndexToLabel(s.board.activePresetIndex)}`],
          }),
        })),
      dawCommand: (_, { preset, command }) =>
        firmwareLog(MODE_TITLES[preset], `DAW: ${command} (via Nektar DAW Integration; MIDI bytes not modeled)`),
    },
  });

  function startDeviceActor() {
    const actor = createActor(machine);
    actor.subscribe((snapshot) => {
      const view = toDeviceModeView(snapshot);
      // `get()` is still undefined if this fires while the store itself is being created.
      const previousMode = (get() as PacerStore | undefined)?.deviceMode.mode ?? "user";
      if (view.mode !== previousMode && (view.mode === "track" || view.mode === "transport")) {
        firmwareLog(MODE_TITLES[view.mode], `Entered built-in ${MODE_TITLES[view.mode]} (DAW control)`);
      }
      set({ deviceMode: view });
    });
    return actor.start();
  }

  let deviceActor = startDeviceActor();

  /** Back to a fresh machine in `user` mode, without firing any of its actions. */
  function resetDeviceActor() {
    deviceActor.stop();
    deviceActor = startDeviceActor();
    set({ deviceMode: toDeviceModeView(deviceActor.getSnapshot()) });
  }

  function runEngine(controlId: number, phase: ControlPhase) {
    const { board, effect } = applyBoardEvent(get().board, { controlId, phase });
    set((s) => {
      // The engine drops a preset-changing press's matching release (runtime state resets on
      // preset change), so swallow it here rather than logging a spurious guard warning.
      const leavesPreset = effect.presetChanged !== undefined || effect.specialPresetRequested !== undefined;
      const swallowedReleases = leavesPreset ? [...s.swallowedReleases, controlId] : s.swallowedReleases;
      const lines = formatBoardEffect(effect);
      if (lines.length === 0) return { board, swallowedReleases };
      return {
        board,
        swallowedReleases,
        log: appendLog(s.log, { kind: "control", title: `${controlLabel(controlId)} — ${phase}`, lines }),
      };
    });
    if (effect.specialPresetRequested) deviceActor.send({ type: "ENTER_SPECIAL", preset: effect.specialPresetRequested });
  }

  return {
    board: createBoardState(loadFactoryDefaults(), FIRST_USER_PRESET_INDEX),
    configSource: "Factory defaults",
    log: [],
    deviceMode: toDeviceModeView(deviceActor.getSnapshot()),
    swallowedReleases: [],
    selectedControlId: undefined,

    press: (controlId) => {
      if (get().deviceMode.mode !== "user") {
        // Special presets only define the 10 stompswitches; external controls do nothing there.
        set((s) => ({ swallowedReleases: [...s.swallowedReleases, controlId] }));
        if (STOMPSWITCH_IDS.includes(controlId)) deviceActor.send({ type: "SWITCH", controlId });
        return;
      }
      runEngine(controlId, "press");
    },

    release: (controlId) => {
      const { swallowedReleases, board } = get();
      if (swallowedReleases.includes(controlId)) {
        set((s) => ({ swallowedReleases: s.swallowedReleases.filter((id) => id !== controlId) }));
        return;
      }
      // Pressing an unconfigured control already logged a warning; don't repeat it on release.
      if (!board.config.presets[board.activePresetIndex]?.controls[controlId]) return;
      runEngine(controlId, "release");
    },

    presetButtonDown: () => {
      // The Current slot isn't in any front-panel bank; start from bank A then.
      const currentBank = presetBank(get().board.activePresetIndex) ?? 0;
      deviceActor.send({ type: "PRESET_DOWN", currentBank });
    },

    presetButtonUp: () => deviceActor.send({ type: "PRESET_UP" }),

    jumpToPreset: (index) => {
      // A direct jump always lands on a user preset, leaving any special preset.
      resetDeviceActor();
      set((s) => ({
        board: withPreset(s.board, index),
        swallowedReleases: [],
        log: appendLog(s.log, {
          kind: "app",
          title: "Preset list",
          lines: [`Jumped to ${presetIndexToLabel(index)} (app shortcut, no hardware action)`],
        }),
      }));
    },

    selectControl: (controlId) => set({ selectedControlId: controlId }),

    loadConfig: (config, source, initialPresetIndex = FIRST_USER_PRESET_INDEX) => {
      resetDeviceActor();
      set({ board: createBoardState(config, initialPresetIndex), configSource: source, log: [], swallowedReleases: [] });
    },

    clearLog: () => set({ log: [] }),
  };
});
