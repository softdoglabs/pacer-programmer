// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../../App";
import { loadFactoryDefaults } from "../../pacer/factoryDefaults";
import { ControlId, userPresetIndex } from "../../pacer/protocol/constants";
import { usePacerStore } from "../../store/pacerStore";

const store = () => usePacerStore.getState();
const A1 = userPresetIndex(0, 1);
const display = () => screen.getByTestId("display-line2").parentElement!.textContent;

function tap(el: Element) {
  fireEvent.keyDown(el, { key: " " });
  fireEvent.keyUp(el, { key: " " });
}

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  act(() => {
    for (const e of store().library.entries) store().deleteSavedConfig(e.id);
    store().loadConfig(loadFactoryDefaults(), "Factory defaults");
    store().setUiMode("play");
  });
});
afterEach(cleanup);

function enterEditMode() {
  fireEvent.click(screen.getByRole("radio", { name: "Edit" }));
  expect(store().uiMode).toBe("edit");
}

describe("programming interface", () => {
  it("in Edit mode, tapping a switch selects it for editing and fires nothing", () => {
    render(<App />);
    enterEditMode();
    tap(screen.getByRole("button", { name: /^Switch 1:/ }));
    expect(store().selectedControlId).toBe(ControlId.Stompswitch1);
    expect(store().log).toEqual([]);
    expect(screen.getByRole("heading", { name: "Stomp 1" })).toBeTruthy();
    // Only configured steps are shown: factory switch 1 has just step 1.
    expect(screen.getAllByRole("region", { name: /^Step \d$/ }).map((r) => r.getAttribute("aria-label"))).toEqual([
      "Step 1",
    ]);
  });

  it("renames the preset, shows it on the display, and undoes", () => {
    render(<App />);
    enterEditMode();
    const field = screen.getByRole("textbox", { name: /Preset A1/ });
    fireEvent.change(field, { target: { value: "LOOP" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(store().board.config.presets[A1]!.name).toBe("LOOP ");
    expect(display()).toContain("LOOP");
    expect(screen.getByText("● unsaved")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(store().board.config.presets[A1]!.name).toBe("PRGM1");
    expect(screen.queryByText("● unsaved")).toBeNull();
  });

  it("changes a step's type from the picker, and the faceplate caption follows", () => {
    render(<App />);
    enterEditMode();
    tap(screen.getByRole("button", { name: /^Switch 1:/ }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add step" }));
    const step2 = screen.getByRole("region", { name: "Step 2" });
    fireEvent.click(within(step2).getByRole("button", { name: /Step 2 type/ }));
    fireEvent.click(screen.getByRole("option", { name: "CC Toggle" }));
    const step = store().board.config.presets[A1]!.controls[ControlId.Stompswitch1]!.steps[2]!;
    expect(step).toMatchObject({ active: true, data: [0, 0, 127] });
    expect(screen.getByRole("button", { name: "Switch 1: PC0 CC0⇅" })).toBeTruthy();
  });

  it("adds steps up to six, then disables +; removing a step keeps its settings for next time", () => {
    render(<App />);
    enterEditMode();
    tap(screen.getByRole("button", { name: /^Switch 1:/ }));
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: "+ Add step" }));
    expect(screen.getAllByRole("region", { name: /^Step \d$/ })).toHaveLength(6);
    expect(screen.getByRole("button", { name: /\+ Add step \(all 6 in use\)/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Remove step 1" })).toBeNull(); // step 1 always stays

    fireEvent.click(screen.getByRole("button", { name: "Remove step 3" }));
    expect(screen.queryByRole("region", { name: "Step 3" })).toBeNull();
    const steps = store().board.config.presets[A1]!.controls[ControlId.Stompswitch1]!.steps;
    expect(steps[3]).toMatchObject({ active: false });
    fireEvent.click(screen.getByRole("button", { name: "+ Add step" })); // fills the gap: step 3 again
    expect(screen.getByRole("region", { name: "Step 3" })).toBeTruthy();
  });

  it("picks LED colors from the swatches", () => {
    render(<App />);
    enterEditMode();
    tap(screen.getByRole("button", { name: /^Switch 1:/ }));
    const step1 = screen.getByRole("region", { name: "Step 1" });
    const onColor = within(step1).getByRole("radiogroup", { name: /On color/ });
    fireEvent.click(within(onColor).getByRole("radio", { name: "2A Red" }));
    expect(store().board.config.presets[A1]!.controls[ControlId.Stompswitch1]!.led[1]!.activeColor).toBe(0x03);
  });

  it("asks before discarding unsaved edits when switching configurations", () => {
    const fixture = new Uint8Array(readFileSync("fixtures/factory-presets.syx"));
    act(() => store().importSyxFile("other.syx", fixture));
    render(<App />);
    enterEditMode();
    const field = screen.getByRole("textbox", { name: /Preset A1/ });
    fireEvent.change(field, { target: { value: "EDIT" } });
    fireEvent.keyDown(field, { key: "Enter" });

    const list = screen.getByRole("list", { name: "Saved configurations" });
    fireEvent.click(within(list).getByRole("button", { name: /^Factory defaults/ }));
    expect(screen.getByRole("dialog", { name: /Discard unsaved changes to “other”/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(store().configSource).toBe("other");
    expect(store().board.config.presets[A1]!.name).toBe("EDIT ");

    fireEvent.click(within(list).getByRole("button", { name: /^Factory defaults/ }));
    fireEvent.click(screen.getByRole("button", { name: "Discard and continue" }));
    expect(store().configSource).toBe("Factory defaults");
  });
});
