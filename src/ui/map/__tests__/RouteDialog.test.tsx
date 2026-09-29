// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compileMachine, recoverMachine, type MachineState, type StateMachine } from "../../../pacer/analysis";
import {
  ControlId,
  SwitchMessageType,
  presetSelectTargetToIndex,
  userPresetIndex,
} from "../../../pacer/protocol/constants";
import type { Preset } from "../../../pacer/protocol/types";
import { usePacerStore } from "../../../store/pacerStore";
import { RouteDialog } from "../RouteDialog";

const store = () => usePacerStore.getState();

const body = (note: number): Preset["controls"] => ({
  [ControlId.Stompswitch1]: {
    steps: { 1: { channel: 0, msgType: SwitchMessageType.Note, data: [note, 127, 0], active: true } },
    led: {},
  },
});

/** Mains entering one looper that comes back, so the looper is several presets on the device. */
function looper(mains: number): StateMachine {
  const states: MachineState[] = Array.from({ length: mains }, (_, i) => ({
    id: `m${i}`,
    name: `MAIN${i}`,
    body: body(60 + i),
    // The third main is left out on purpose: somewhere to route from that isn't already in.
    transitions:
      i < 2 ? [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "state" as const, id: "loop" } }] : [],
  }));
  return {
    states: [
      ...states,
      {
        id: "loop",
        name: "LOOPR",
        body: body(99),
        transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "return" } }],
      },
    ],
  };
}

/** Opens a compiled machine as a configuration, the way a file or a pull would. */
function load(mains: number) {
  const compiled = compileMachine(looper(mains));
  if (!compiled.ok) throw new Error(compiled.error);
  act(() => store().loadConfig(compiled.config, "Looper"));
  const machine = recoverMachine(store().board.config);
  return {
    id: (name: string) => machine.states.find((s) => s.name?.trim() === name)!.id,
    members: (name: string) => machine.members[machine.states.find((s) => s.name?.trim() === name)!.id]!,
  };
}

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

describe("editing a route from the map", () => {
  it("writes the route into every preset the state is", () => {
    const machine = load(2);
    const onClose = vi.fn();
    render(
      <RouteDialog
        intent={{ kind: "add", fromStateId: machine.id("LOOPR"), toStateId: machine.id("MAIN0") }}
        onClose={onClose}
      />,
    );
    // Two presets, so the dialog says so before anything is written.
    expect(screen.getByText(/all 2 presets it is/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add route" }));
    expect(onClose).toHaveBeenCalled();

    const home = machine.members("MAIN0")[0];
    const config = store().board.config;
    // Stomp 2: the first switch with nothing on it (stomp 1 carries the state's own note).
    for (const copy of machine.members("LOOPR")) {
      const step = config.presets[copy]?.controls[ControlId.Stompswitch2]?.steps[1];
      expect(step?.msgType).toBe(SwitchMessageType.PresetSelect);
      expect(presetSelectTargetToIndex(step!.data[0])).toBe(home);
    }
    expect(store().editHistory.past.length).toBe(1); // one edit, undoable as one
  });

  it("asks for a preset when the route needs a copy, and makes it there", () => {
    /*
     * LOOPR comes back to wherever it entered from, so a third way in is a third copy of it —
     * a preset, which the device has none spare of until something is cleared. The dialog says so
     * and asks which slot it takes.
     */
    const machine = load(3);
    const onClose = vi.fn();
    render(
      <RouteDialog
        intent={{ kind: "add", fromStateId: machine.id("MAIN2"), toStateId: machine.id("LOOPR") }}
        onClose={onClose}
      />,
    );
    expect(screen.getByText(/needs another preset/)).toBeTruthy();
    expect(screen.getByLabelText("Copy of LOOPR goes in")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add route" }));
    expect(onClose).toHaveBeenCalled();

    const config = store().board.config;
    // The compiled machine used A1-A5, so the first empty preset is A6.
    const copy = userPresetIndex(0, 6);
    const home = machine.members("MAIN2")[0]!;
    expect(config.presets[copy]?.name?.trim()).toBe("LOOPR");
    expect(presetSelectTargetToIndex(config.presets[copy]!.controls[ControlId.StompswitchA]!.steps[1]!.data[0])).toBe(
      home,
    );
    const after = recoverMachine(config);
    const loop = after.states.find((s) => s.name === "LOOPR")!;
    expect(after.members[loop.id]).toHaveLength(3);
    expect(loop.transitions.some((t) => t.to.kind === "return")).toBe(true);
  });

  it("offers to clear a switch that's already busy, and does it on every copy", () => {
    /*
     * The usual case on a real device: every switch already does something, so a route has
     * nowhere to go until one of them gives way. That's offered, not done quietly.
     */
    const machine = load(2);
    const onClose = vi.fn();
    render(
      <RouteDialog
        intent={{ kind: "add", fromStateId: machine.id("LOOPR"), toStateId: machine.id("MAIN1") }}
        onClose={onClose}
      />,
    );
    // Stomp 1 sends the state's note; the route would otherwise share the press with it.
    fireEvent.click(screen.getByRole("button", { name: /On switch/i }));
    fireEvent.click(screen.getByRole("option", { name: /^1 —/ }));
    expect(screen.getByText(/Replace what 1 does/)).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Add route" }));
    expect(onClose).toHaveBeenCalled();

    const home = machine.members("MAIN1")[0];
    for (const copy of machine.members("LOOPR")) {
      const steps = store().board.config.presets[copy]?.controls[ControlId.Stompswitch1]?.steps;
      expect(steps?.[1]?.msgType).toBe(SwitchMessageType.PresetSelect);
      expect(presetSelectTargetToIndex(steps![1]!.data[0])).toBe(home);
      // The note that was on it is gone, not pushed to another step.
      expect(Object.values(steps!).filter((s) => s?.active && s.msgType === SwitchMessageType.Note)).toHaveLength(0);
    }
  });
});
