// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { createActor, type SnapshotFrom } from "xstate";
import { create } from "zustand";
import { deviceModeMachine, type DeviceMode } from "../pacer/device";
import { isStompswitch } from "../pacer/hardware";
import { FIRST_USER_PRESET_INDEX, presetBank, presetIndexToLabel } from "../pacer/protocol/constants";
import { EXPECTED_FULL_DUMP_MESSAGES } from "../pacer/protocol/requests";
import { loadFactoryDefaults } from "../pacer/factoryDefaults";
import type { PacerConfig } from "../pacer/protocol/types";
import {
  applyBoardEvent,
  changePreset,
  controlLabel,
  resetMidiState as forgetRememberedMidi,
  createBoardState,
  formatBoardEffect,
  midiMessageToBytes,
  type BoardState,
  type ControlPhase,
  type OutgoingMidiMessage,
} from "../pacer/simulator";
import { MemoryStorage, browserStorage } from "../library/configLibrary";
import {
  browserMidiRequester,
  connectMidi,
  type MidiAccessRequester,
  type MidiConnection,
  type MidiPortInfo,
} from "../midi/webMidi";
import {
  createConfigurationsSlice,
  isSendingToPacer,
  type ConfigurationsSlice,
  type PullView,
} from "./configurationsSlice";
import { createEditingSlice, type EditHistory, type EditScope, type EditingSlice } from "./editingSlice";
import { createSendSlice, type SendSlice, type SendView } from "./sendSlice";

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

export type MidiStatus = "disconnected" | "connecting" | "connected" | "unsupported" | "denied";

export interface MidiView {
  status: MidiStatus;
  /** Connected ports (refreshed as devices come and go). */
  outputs: MidiPortInfo[];
  inputs: MidiPortInfo[];
  /** Where simulated presses are sent. Undefined = don't send (the default, so nothing surprising hits real gear). */
  outputId?: string;
  sysexEnabled: boolean;
  error?: string;
}

export interface PacerStore extends ConfigurationsSlice, EditingSlice, SendSlice {
  /**
   * The loaded config and the current *user* preset. While a firmware special preset (preset
   * select, Track, Transport) is active, this still points at the last user preset: that's what
   * [Preset] returns to.
   */
  board: BoardState;
  /** Display name of the open configuration ("Factory defaults", a saved snapshot's name). */
  configSource: string;
  /**
   * Identifies the current simulator session. Every configuration load starts a new one, with
   * all per-session state rebuilt from scratch (see `freshSession`). The simulator UI is keyed on
   * it, so component state (held presses, open tabs) can't leak across configurations either.
   */
  sessionId: number;
  /** The config as last opened or saved: the baseline for "unsaved edits" (see `hasUnsavedEdits`). */
  savedConfig: PacerConfig;
  editHistory: EditHistory;
  log: LogEntry[];
  deviceMode: DeviceModeView;
  /**
   * Controls whose next release must not reach the engine: their press was handled by a
   * firmware special preset, or it changed the preset.
   */
  swallowedReleases: number[];
  selectedControlId?: number;
  /** Whether the device & configurations drawer is showing (see `ui/DeviceDrawer`). */
  deviceDrawerOpen: boolean;
  setDeviceDrawerOpen: (open: boolean) => void;
  press: (controlId: number) => void;
  release: (controlId: number) => void;
  /** An expression pedal swept to a position (0 = heel down, 1 = toe down). */
  movePedal: (controlId: number, position: number) => void;
  /** [Preset] is a tap-vs-hold switch (see deviceModeMachine.ts), so it needs both edges. */
  presetButtonDown: () => void;
  presetButtonUp: () => void;
  /** Direct jump from the app's preset list: not something the hardware itself can do in one action. */
  jumpToPreset: (index: number) => void;
  selectControl: (controlId: number | undefined) => void;
  loadConfig: (config: PacerConfig, source: string, initialPresetIndex?: number) => void;
  clearLog: () => void;
  /** Forgets the device's remembered MIDI values (program per channel, CC values, notes). */
  resetMidiState: () => void;
  midi: MidiView;
  /** Requests Web MIDI access (`requester` is for tests; defaults to the browser's). */
  connectMidi: (requester?: MidiAccessRequester) => Promise<void>;
  selectMidiOutput: (outputId: string | undefined) => void;
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

let nextSessionId = 0;

/** Everything that belongs to one run of the simulator on one configuration, freshly initialized. */
function freshSession(config: PacerConfig, initialPresetIndex: number) {
  return {
    sessionId: nextSessionId++,
    board: createBoardState(config, initialPresetIndex),
    savedConfig: config,
    sendBaseline: config,
    editHistory: { past: [], future: [] } as EditHistory,
    log: [] as LogEntry[],
    swallowedReleases: [] as number[],
    selectedControlId: undefined as number | undefined,
    // Back to changing a state as a whole: narrowing to one preset was about the last one.
    editScope: "state" as EditScope,
    // Part of the session, so loading a configuration closes the panel that loaded it.
    deviceDrawerOpen: false,
    /*
     * Device results belong to the session that asked for them: a "No reply from the Pacer"
     * from before you opened this snapshot is stale, and nothing else ever clears it.
     * `loadConfig` refuses while either is running, so neither is dropped mid-flight.
     */
    pull: { status: "idle", received: 0, expected: EXPECTED_FULL_DUMP_MESSAGES } as PullView,
    send: { status: "idle" } as SendView,
  };
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

  /**
   * A preset recall: the board moves, and whatever the preset sends on load goes out and is
   * logged with it. Every path that recalls one goes through here (the firmware's preset select,
   * returning from a DAW preset, the app's own jump) so none of them can forget the messages.
   */
  function recallPreset(index: number, title: string, line: string, kind: LogEntry["kind"] = "firmware") {
    set((s) => {
      const { board, effect } = changePreset(s.board, index);
      const sentLine = sendMidi(effect.messages);
      const lines = [line, ...formatBoardEffect(effect), ...(sentLine ? [sentLine] : [])];
      return { board, log: appendLog(s.log, { kind, title, lines }) };
    });
  }

  const machine = deviceModeMachine.provide({
    actions: {
      loadPreset: (_, { index }) =>
        recallPreset(
          index,
          "Preset select",
          `Preset changed: ${presetIndexToLabel(get().board.activePresetIndex)} -> ${presetIndexToLabel(index)}`,
        ),
      returnToLastPreset: () => {
        const index = get().board.activePresetIndex;
        recallPreset(index, "Preset button", `Returned to last preset ${presetIndexToLabel(index)}`);
      },
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

  let midiConnection: MidiConnection | undefined;

  /** Sends the engine's MIDI to the selected output. Returns a log line describing the outcome, if any. */
  function sendMidi(messages: OutgoingMidiMessage[]): string | undefined {
    const { outputId, outputs } = get().midi;
    if (!midiConnection || outputId === undefined || messages.length === 0) return undefined;
    /*
     * The simulator's output is whatever port the user picked, and that can be the Pacer's own.
     * While a send is running, anything arriving there restarts the quiet window the firmware
     * uses to commit writes — the condition that corrupts a preset (see midi/pacerWrite.ts) — so
     * presses are dropped rather than queued: they're a performance, and a late one is a lie.
     */
    if (outputId === get().pacerPorts.outputId && isSendingToPacer(get())) {
      return "(not sent) the Pacer is being written to; its port is quiet until that finishes";
    }
    const failures = messages
      .map((m) => midiConnection!.send(outputId, midiMessageToBytes(m)))
      .filter((r): r is { ok: false; reason: string } => !r.ok);
    const name = outputs.find((o) => o.id === outputId)?.name ?? outputId;
    if (failures.length === 0) return `→ sent to ${name}`;
    const reasons = [...new Set(failures.map((f) => f.reason))].join("; ");
    return `(warning) ${failures.length} of ${messages.length} message(s) not sent to ${name}: ${reasons}`;
  }

  function refreshMidiPorts() {
    if (!midiConnection) return;
    const outputs = midiConnection.outputs();
    const inputs = midiConnection.inputs();
    const { outputId } = get().midi;
    const lost = outputId !== undefined && !outputs.some((o) => o.id === outputId);
    set((s) => ({
      midi: { ...s.midi, outputs, inputs, outputId: lost ? undefined : outputId },
      log: lost
        ? appendLog(s.log, { kind: "app", title: "MIDI", lines: ["Output disconnected; sending stopped"] })
        : s.log,
    }));
    get().refreshPacerPorts();
  }

  const storage = browserStorage();

  function runEngine(controlId: number, phase: ControlPhase, position?: number) {
    const { board, effect } = applyBoardEvent(get().board, { controlId, phase, position });
    const sentLine = sendMidi(effect.messages);
    set((s) => {
      // The engine drops a preset-changing press's matching release (runtime state resets on
      // preset change), so swallow it here rather than logging a spurious guard warning.
      const leavesPreset = effect.presetChanged !== undefined || effect.specialPresetRequested !== undefined;
      const swallowedReleases = leavesPreset ? [...s.swallowedReleases, controlId] : s.swallowedReleases;
      const lines = [...formatBoardEffect(effect), ...(sentLine ? [sentLine] : [])];
      if (lines.length === 0) return { board, swallowedReleases };
      return {
        board,
        swallowedReleases,
        log: appendLog(s.log, { kind: "control", title: `${controlLabel(controlId)} — ${phase}`, lines }),
      };
    });
    if (effect.specialPresetRequested)
      deviceActor.send({ type: "ENTER_SPECIAL", preset: effect.specialPresetRequested });
  }

  return {
    ...createEditingSlice(set, get),
    ...createSendSlice(set, get, { midiConnection: () => midiConnection }),
    ...createConfigurationsSlice(set, get, {
      storage: storage ?? new MemoryStorage(),
      persistent: storage !== undefined,
      midiConnection: () => midiConnection,
    }),
    ...freshSession(loadFactoryDefaults(), FIRST_USER_PRESET_INDEX),
    configSource: "Factory defaults",
    deviceMode: toDeviceModeView(deviceActor.getSnapshot()),

    press: (controlId) => {
      if (get().deviceMode.mode !== "user") {
        // Special presets only define the 10 stompswitches; external controls do nothing there.
        set((s) => ({ swallowedReleases: [...s.swallowedReleases, controlId] }));
        if (isStompswitch(controlId)) deviceActor.send({ type: "SWITCH", controlId });
        return;
      }
      runEngine(controlId, "press");
    },

    movePedal: (controlId, position) => runEngine(controlId, "move", position),

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
      // A direct jump always lands on a user preset, leaving any special preset. Choosing it here
      // isn't something the hardware can do in one action, but what the preset then sends on load
      // is the hardware's own behaviour, so it fires.
      resetDeviceActor();
      set({ swallowedReleases: [] });
      recallPreset(index, "Preset chooser", `Jumped to ${presetIndexToLabel(index)} (app shortcut)`, "app");
    },

    selectControl: (controlId) => set({ selectedControlId: controlId }),

    setDeviceDrawerOpen: (deviceDrawerOpen) => set({ deviceDrawerOpen }),

    loadConfig: (config, source, initialPresetIndex = FIRST_USER_PRESET_INDEX) => {
      // A new configuration means a new simulator session: the firmware mode machine and all
      // per-session state are rebuilt, never patched.
      resetDeviceActor();
      set({ ...freshSession(config, initialPresetIndex), configSource: source });
    },

    clearLog: () => set({ log: [] }),

    resetMidiState: () =>
      set((s) => ({
        board: forgetRememberedMidi(s.board),
        log: appendLog(s.log, {
          kind: "app",
          title: "MIDI state",
          lines: ["Remembered MIDI values reset (programs, CC values, notes)"],
        }),
      })),

    midi: { status: "disconnected", outputs: [], inputs: [], sysexEnabled: false },

    connectMidi: async (requester) => {
      const { status } = get().midi;
      if (status === "connecting" || status === "connected") return;
      set((s) => ({ midi: { ...s.midi, status: "connecting", error: undefined } }));
      const result = await connectMidi(requester ?? browserMidiRequester());
      switch (result.kind) {
        case "unsupported":
          set((s) => ({ midi: { ...s.midi, status: "unsupported" } }));
          return;
        case "denied":
          set((s) => ({ midi: { ...s.midi, status: "denied", error: result.message } }));
          return;
        case "connected":
          midiConnection = result.connection;
          midiConnection.onPortsChanged(refreshMidiPorts);
          set((s) => ({ midi: { ...s.midi, status: "connected", sysexEnabled: result.connection.sysexEnabled } }));
          refreshMidiPorts();
      }
    },

    selectMidiOutput: (outputId) => set((s) => ({ midi: { ...s.midi, outputId } })),
  };
});

// Reopen whatever configuration was open on the last visit (a per-browser convenience).
usePacerStore.getState().restoreLastOpened();
