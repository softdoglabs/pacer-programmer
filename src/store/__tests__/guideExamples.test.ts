import { beforeEach, describe, expect, it } from "vitest";
import { computePanelState } from "../../pacer/panel";
import {
  ControlId,
  ControlMode,
  SwitchMessageType,
  presetIndexToPresetSelectTarget,
  userPresetIndex,
} from "../../pacer/protocol/constants";
import { ledColorCode } from "../../pacer/protocol/ledColors";
import {
  createEmptyPacerConfig,
  getOrCreateControl,
  getOrCreatePreset,
  type PacerConfig,
  type Step,
} from "../../pacer/protocol/types";
import { usePacerStore } from "../pacerStore";

/*
 * The examples in docs/guide, run through the store exactly as the app runs them. Each test
 * quotes the sentence it checks, so a failure says which page is wrong.
 */

const store = () => usePacerStore.getState();
const A1 = userPresetIndex(0, 1);
const A2 = userPresetIndex(0, 2);
const B1 = userPresetIndex(1, 1);
const B2 = userPresetIndex(1, 2);
const T = SwitchMessageType;
const C = ControlId;

const step = (msgType: number, data: [number, number, number], active = true): Step => ({
  channel: 1,
  msgType,
  data,
  active,
});
const jump = (to: number) => step(T.PresetSelect, [presetIndexToPresetSelectTarget(to), 0, 0]);
const red = ledColorCode("red", "bright");
const dimRed = ledColorCode("red", "dim");
const green = ledColorCode("green", "bright");
const dimGreen = ledColorCode("green", "dim");

/** A configuration with the given switches on the given presets, named so the slots are real. */
function configWith(
  presets: Record<number, Record<number, { steps: Step[]; mode?: ControlMode; colours?: [number, number][] }>>,
) {
  const config: PacerConfig = createEmptyPacerConfig();
  for (const [index, controls] of Object.entries(presets)) {
    const preset = getOrCreatePreset(config, Number(index));
    preset.name = `P${index}`.padEnd(5);
    for (const [id, { steps, mode, colours }] of Object.entries(controls)) {
      const control = getOrCreateControl(preset, Number(id));
      if (mode !== undefined) control.controlMode = mode;
      steps.forEach((s, i) => (control.steps[i + 1] = s));
      colours?.forEach(
        ([on, off], i) => (control.led[i + 1] = { midiFeedback: 0, activeColor: on, inactiveColor: off, position: 0 }),
      );
    }
  }
  return config;
}

/** The MIDI an action sent, as the log words it. */
function sent(action: () => void): string[] {
  const before = store().log.length;
  action();
  return store()
    .log.slice(before)
    .flatMap((e) => e.lines)
    .filter((l) => l.startsWith("CH"))
    .map((l) => l.replace(/ \[.*\]$/, ""));
}

const tap = (id: number) => sent(() => (store().press(id), store().release(id)));
const bar = (id: "sw1" | "sw2" | "swA" | "swC") =>
  computePanelState(store().board, store().deviceMode).switches[id].lights.bottom;
const hueOf = (id: "sw1" | "sw2" | "swA" | "swC") => {
  const light = bar(id);
  return light?.color.kind === "hue" ? `${light.brightness} ${light.color.hue}` : light?.brightness;
};

beforeEach(() => {
  store().clearLog();
});

describe("Switches and Steps", () => {
  it("All at Once: 'One press sends PC 12 and moves the Pacer to B1'", () => {
    store().loadConfig(
      configWith({ [A1]: { [C.StompswitchA]: { steps: [step(T.ProgramAndBank, [12, 0, 0]), jump(B1)] } } }),
      "t",
    );
    expect(tap(C.StompswitchA)).toEqual(["CH1 Program Change 12"]);
    expect(store().board.activePresetIndex).toBe(B1);
  });

  it("'If you put two Preset Select steps on the same press, the second one is ignored'", () => {
    store().loadConfig(configWith({ [A1]: { [C.StompswitchA]: { steps: [jump(B1), jump(B2)] } } }), "t");
    tap(C.StompswitchA);
    expect(store().board.activePresetIndex).toBe(B1);
  });

  it("Sequence: 'Press once for patch 1, again for patch 2, again for 3, and the fourth press is patch 1 again'", () => {
    const programs = [1, 2, 3].map((p) => step(T.ProgramAndBank, [p, 0, 0]));
    store().loadConfig(
      configWith({ [A1]: { [C.Stompswitch1]: { steps: programs, mode: ControlMode.Sequence } } }),
      "t",
    );
    const presses = [1, 2, 3, 4].flatMap(() => tap(C.Stompswitch1));
    expect(presses).toEqual([
      "CH1 Program Change 1",
      "CH1 Program Change 2",
      "CH1 Program Change 3",
      "CH1 Program Change 1",
    ]);
  });

  it("'Inactive steps are skipped. A step whose type is Off still takes its turn and just sends nothing'", () => {
    const steps = [
      step(T.ProgramAndBank, [1, 0, 0]),
      step(T.ProgramAndBank, [2, 0, 0], false), // inactive: skipped
      step(T.Off, [0, 0, 0]), // Off: takes its turn
      step(T.ProgramAndBank, [4, 0, 0]),
    ];
    store().loadConfig(configWith({ [A1]: { [C.Stompswitch1]: { steps, mode: ControlMode.Sequence } } }), "t");
    expect([tap(C.Stompswitch1), tap(C.Stompswitch1), tap(C.Stompswitch1)]).toEqual([
      ["CH1 Program Change 1"],
      [],
      ["CH1 Program Change 4"],
    ]);
  });

  it("Sequence: 'The light follows along: it shows the colours of whichever step fires next'", () => {
    const steps = [step(T.ProgramAndBank, [1, 0, 0]), step(T.ProgramAndBank, [2, 0, 0])];
    store().loadConfig(
      configWith({
        [A1]: {
          [C.Stompswitch1]: {
            steps,
            mode: ControlMode.Sequence,
            colours: [
              [red, dimRed],
              [green, dimGreen],
            ],
          },
        },
      }),
      "t",
    );
    expect(hueOf("sw1")).toMatch(/red/);
    tap(C.Stompswitch1);
    expect(hueOf("sw1")).toMatch(/green/);
  });

  it("Toggles share their state: 'Press one, and the other's next press sends the opposite value, and both lights agree'", () => {
    const toggle = { steps: [step(T.CcToggle, [20, 127, 0])], colours: [[green, red]] as [number, number][] };
    store().loadConfig(configWith({ [A1]: { [C.Stompswitch1]: toggle, [C.Stompswitch2]: toggle } }), "t");
    expect(tap(C.Stompswitch1)).toEqual(["CH1 CC#20 = 127"]);
    expect([hueOf("sw1"), hueOf("sw2")]).toEqual(["bright green", "bright green"]);
    expect(tap(C.Stompswitch2)).toEqual(["CH1 CC#20 = 0"]);
    expect([hueOf("sw1"), hueOf("sw2")]).toEqual(["bright red", "bright red"]);
  });

  it("Momentary or latching: CC Trigger 'sends one value when you press and another when you let go'", () => {
    store().loadConfig(configWith({ [A1]: { [C.Stompswitch1]: { steps: [step(T.CcTrigger, [30, 127, 0])] } } }), "t");
    expect(sent(() => store().press(C.Stompswitch1))).toEqual(["CH1 CC#30 = 127"]);
    expect(sent(() => store().release(C.Stompswitch1))).toEqual(["CH1 CC#30 = 0"]);
  });

  it("Momentary or latching: Note 'sounds while you hold', Note Toggle 'starts on one press and stops on the next'", () => {
    store().loadConfig(
      configWith({
        [A1]: {
          [C.Stompswitch1]: { steps: [step(T.Note, [60, 100, 0])] },
          [C.Stompswitch2]: { steps: [step(T.NoteToggle, [62, 100, 0])] },
        },
      }),
      "t",
    );
    expect(sent(() => store().press(C.Stompswitch1))[0]).toMatch(/Note On #60/);
    expect(sent(() => store().release(C.Stompswitch1))[0]).toMatch(/Note Off #60|Note On #60 vel 0/);
    expect(tap(C.Stompswitch2)[0]).toMatch(/Note On #62 vel 100/);
    expect(tap(C.Stompswitch2)[0]).toMatch(/Note Off #62|Note On #62 vel 0/);
  });
});

describe("Lights and Colours", () => {
  it("'In All at once mode that's always step 1 … The other steps' colours never show'", () => {
    const steps = [step(T.ProgramAndBank, [1, 0, 0]), step(T.ProgramAndBank, [2, 0, 0])];
    store().loadConfig(
      configWith({
        [A1]: {
          [C.Stompswitch1]: {
            steps,
            colours: [
              [red, dimRed],
              [green, dimGreen],
            ],
          },
        },
      }),
      "t",
    );
    expect(hueOf("sw1")).toMatch(/red/);
    tap(C.Stompswitch1);
    expect(hueOf("sw1")).toMatch(/red/);
  });

  it("'a CC Toggle with green and red … stays that way when you change preset and come back'", () => {
    store().loadConfig(
      configWith({
        [A1]: {
          [C.Stompswitch1]: { steps: [step(T.CcToggle, [21, 127, 0])], colours: [[green, red]] },
          [C.StompswitchA]: { steps: [jump(A2)] },
        },
        [A2]: { [C.StompswitchA]: { steps: [jump(A1)] } },
      }),
      "t",
    );
    expect(hueOf("sw1")).toBe("bright red");
    tap(C.Stompswitch1);
    expect(hueOf("sw1")).toBe("bright green");
    tap(C.StompswitchA);
    tap(C.StompswitchA);
    expect(store().board.activePresetIndex).toBe(A1);
    expect(hueOf("sw1")).toBe("bright green");
  });

  it("Preset Select to one of your presets shows its first colour always; Preset Inc/Dec stays dark", () => {
    store().loadConfig(
      configWith({
        [A1]: {
          [C.StompswitchA]: { steps: [jump(A2)], colours: [[green, red]] },
          [C.StompswitchC]: { steps: [step(T.PresetIncDec, [1, 0, 0])], colours: [[green, red]] },
        },
      }),
      "t",
    );
    expect(hueOf("swA")).toBe("bright green");
    expect(bar("swC")?.brightness).toBe("off");
  });

  it("'Default uses the step type's own colour: orange for programs … bright when on and dim when off'", () => {
    const pc = { steps: [step(T.ProgramAndBank, [7, 0, 0])], colours: [[0x7f, 0x7f]] as [number, number][] };
    store().loadConfig(configWith({ [A1]: { [C.Stompswitch1]: pc } }), "t");
    expect(hueOf("sw1")).toBe("dim orange");
    tap(C.Stompswitch1);
    expect(hueOf("sw1")).toBe("bright orange");
  });
});

describe("MIDI Sent When a Preset Loads", () => {
  function withLoadMidi() {
    const config = configWith({
      [A1]: { [C.StompswitchA]: { steps: [jump(A2)] } },
      [A2]: { [C.Stompswitch2]: { steps: [step(T.ProgramAndBank, [5, 0, 0])], colours: [[green, red]] } },
    });
    config.presets[A2]!.midiSettings[1] = { channel: 1, msgType: 0x45, data: [5, 0, 0] };
    return config;
  }

  it("'They go out whenever the preset is recalled … Opening a configuration doesn't count'", () => {
    expect(sent(() => store().loadConfig(withLoadMidi(), "t", A2))).toEqual([]);
    store().loadConfig(withLoadMidi(), "t");
    expect(tap(C.StompswitchA)).toEqual(["CH1 Program Change 5"]);
  });

  it("'If a preset sends PC 5 on load, and switch 2 sends PC 5 on the same channel, switch 2 is showing its \"on\" colour as soon as you arrive'", () => {
    store().loadConfig(withLoadMidi(), "t");
    tap(C.StompswitchA);
    expect(store().board.activePresetIndex).toBe(A2);
    expect(hueOf("sw2")).toBe("bright green");
  });
});

describe("The Simulator", () => {
  it("'Reset MIDI state starts over from nothing'", () => {
    store().loadConfig(
      configWith({ [A1]: { [C.Stompswitch1]: { steps: [step(T.CcToggle, [22, 127, 0])], colours: [[green, red]] } } }),
      "t",
    );
    tap(C.Stompswitch1);
    expect(hueOf("sw1")).toBe("bright green");
    store().resetMidiState();
    expect(hueOf("sw1")).toBe("bright red");
  });
});
