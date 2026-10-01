// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../../App";
import { compileMachine, type StateMachine } from "../../pacer/analysis";
import { ControlId, SwitchMessageType, userPresetIndex } from "../../pacer/protocol/constants";
import type { Preset } from "../../pacer/protocol/types";
import { usePacerStore } from "../../store/pacerStore";

const store = () => usePacerStore.getState();

const body = (note: number): Preset["controls"] => ({
  [ControlId.Stompswitch1]: {
    steps: { 1: { channel: 0, msgType: SwitchMessageType.Note, data: [note, 127, 0], active: true } },
    led: {},
  },
});

/** Two mains entering one looper that comes back: the looper is two presets, one state. */
const LOOPER: StateMachine = {
  states: [
    ...[0, 1].map((i) => ({
      id: `m${i}`,
      name: `MAIN${i}`,
      body: body(60 + i),
      transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "state" as const, id: "loop" } }],
    })),
    {
      id: "loop",
      name: "LOOPR",
      body: body(99),
      transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "return" as const } }],
    },
  ],
};

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const compiled = compileMachine(LOOPER);
  if (!compiled.ok) throw new Error(compiled.error);
  act(() => {
    for (const e of store().library.entries) store().deleteSavedConfig(e.id);
    store().loadConfig(compiled.config, "Looper");
    store().setUiMode("map");
  });
});
afterEach(cleanup);

describe("choosing a preset", () => {
  it("shows which slots are copies of one state, and groups them on request", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Preset:/ }));

    // By bank: the hardware's own order, with the copies marked where they fall.
    const copy = screen.getByRole("option", { name: /^A3 .*one of 2 presets of LOOPR/ });
    expect(copy).toBeTruthy();
    expect(within(copy).getByText("×2")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "By state" }));
    expect(screen.getByText(/LOOPR — 2 presets, one state/)).toBeTruthy();
    // And every preset is still reachable: the ones on their own keep a section of their own.
    expect(screen.getByText("One preset each")).toBeTruthy();
    expect(screen.getByRole("option", { name: /^A1 MAIN0/ })).toBeTruthy();
  });

  it("loads the preset that's picked", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Preset:/ }));
    fireEvent.click(screen.getByRole("radio", { name: "By state" }));
    fireEvent.click(screen.getByRole("option", { name: /^A4 LOOPR/ }));
    expect(store().board.activePresetIndex).toBe(userPresetIndex(0, 4));
  });

  it("names the presets behind a count, wherever one is shown", () => {
    /*
     * A count says how many; the slots say which, and they're what you need to find them on the
     * hardware. They don't fit on the display's number line or an edge badge, so each place that
     * shows a count carries them as a tooltip.
     */
    render(<App />);
    act(() => {
      store().jumpToPreset(userPresetIndex(0, 3)); // one of the looper's two presets
      store().setUiMode("program");
    });

    // The display reads x2, and the thing you can point at over it names them.
    expect((screen.getByTestId("display-line2") as HTMLElement).textContent).toBe("x2");
    // Both the display and the overlay that covers its lower half: the overlay is the one a
    // pointer can reach, and the display keeps it for where the overlay isn't.
    expect(screen.getAllByTitle(/LOOPR — 2 presets: A3, A4/).length).toBeGreaterThan(0);

    // So does the badge in the chooser, next to the preset it belongs to.
    fireEvent.click(screen.getByRole("button", { name: /^LOOPR — 2 presets/ }));
    // One per copy — A3 and A4 each say which presets they share a state with.
    expect(screen.getAllByTitle("One of 2 presets of LOOPR: A3, A4")).toHaveLength(2);
  });
});
