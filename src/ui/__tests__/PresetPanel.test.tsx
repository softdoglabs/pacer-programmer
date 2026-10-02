// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../../App";
import { compileMachine } from "../../test/compileMachine";
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

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // MAIN (A1) jumps to TUNER (A2): one route into A2.
  const compiled = compileMachine({
    states: [
      {
        id: "main",
        name: "MAIN",
        body: body(60),
        transitions: [{ controlId: ControlId.StompswitchA, stepNumber: 1, to: { kind: "state", id: "tuner" } }],
      },
      { id: "tuner", name: "TUNER", body: body(61), transitions: [] },
    ],
  });
  if (!compiled.ok) throw new Error(compiled.error);
  act(() => {
    for (const e of store().library.entries) store().deleteSavedConfig(e.id);
    store().loadConfig(compiled.config, "Tuner");
    store().setUiMode("program");
  });
});
afterEach(cleanup);

describe("clearing a preset", () => {
  it("names the switches that would land on it, without refusing", () => {
    render(<App />);
    act(() => store().jumpToPreset(userPresetIndex(0, 2))); // TUNER, which MAIN jumps to
    fireEvent.click(screen.getByRole("button", { name: "Clear preset…" }));

    expect(screen.getByText(/A1 MAIN jumps here, and would land on an empty preset/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear it" }));
    expect(store().board.config.presets[userPresetIndex(0, 2)]?.name).toBe("EMPTY");
  });

  it("says nothing extra when nothing leads to it", () => {
    render(<App />);
    act(() => store().jumpToPreset(userPresetIndex(0, 1))); // MAIN: nothing jumps here
    fireEvent.click(screen.getByRole("button", { name: "Clear preset…" }));
    expect(screen.queryByText(/would land on an empty preset/)).toBeNull();
  });
});
