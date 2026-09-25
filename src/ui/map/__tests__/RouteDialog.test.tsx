// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compileMachine, recoverMachine, type MachineState, type StateMachine } from "../../../pacer/analysis";
import { ControlId, SwitchMessageType, presetSelectTargetToIndex } from "../../../pacer/protocol/constants";
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
    expect(screen.getByText(/all 2 copies of it/)).toBeTruthy();

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

  it("says what a route would cost instead of writing it", () => {
    const machine = load(3);
    const before = store().board.config;
    render(
      <RouteDialog
        intent={{ kind: "add", fromStateId: machine.id("MAIN2"), toStateId: machine.id("LOOPR") }}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add route" }));
    expect(screen.getByText(/one more preset/)).toBeTruthy();
    expect(store().board.config).toBe(before); // nothing written
  });
});
