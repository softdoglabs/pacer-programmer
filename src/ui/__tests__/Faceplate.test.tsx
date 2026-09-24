// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRESET_HOLD_MS } from "../../pacer/device";
import { userPresetIndex } from "../../pacer/protocol/constants";
import { loadFactoryDefaults } from "../../pacer/factoryDefaults";
import { renamePreset } from "../../pacer/editing";
import { usePacerStore } from "../../store/pacerStore";
import { App } from "../../App";

function hold(el: Element) {
  fireEvent.keyDown(el, { key: " " });
}
function tap(el: Element) {
  fireEvent.keyDown(el, { key: " " });
  fireEvent.keyUp(el, { key: " " });
}
const display = () => screen.getByTestId("display-line2").textContent;
/** The name line: an input, whose value isn't document text. */
const displayName = () => (screen.getByTestId("display-line1") as HTMLInputElement).value;
const switchButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^Switch ${name}:`) });

/** The device and its snapshots live in a drawer, opened from the configuration's name. */
function openDeviceDrawer() {
  const trigger = screen.getByTitle("Open configurations and the Pacer connection");
  fireEvent.click(within(trigger).getByRole("button"));
}

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  act(() => usePacerStore.getState().loadConfig(loadFactoryDefaults(), "Factory defaults"));
});
afterEach(cleanup);

describe("Faceplate (factory defaults)", () => {
  it("shows the active preset and each switch's configured action", () => {
    render(<App />);
    expect(display()).toBe("A1");
    expect(screen.getByRole("button", { name: "Switch 1: PC0" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch A: →track" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch D: P+" })).toBeTruthy();
  });

  it("switching configurations starts a fresh simulator: nothing held, selected, or pending carries over", () => {
    const fixture = new Uint8Array(readFileSync("fixtures/factory-presets.syx"));
    act(() => usePacerStore.getState().importSyxFile("other.syx", fixture));
    act(() => usePacerStore.getState().openFactoryDefaults());
    render(<App />);
    const pointer = { pointerId: 1, pointerType: "mouse", button: 0, width: 1, height: 1, pressure: 0.5 };
    const sw1 = switchButton("1");
    fireEvent.pointerDown(sw1, pointer); // held (and selected in the inspector) when the config changes
    expect(usePacerStore.getState().selectedControlId).toBeDefined();

    openDeviceDrawer();
    const list = screen.getByRole("list", { name: "Saved configurations" });
    fireEvent.click(within(list).getByRole("button", { name: /^other/ }));
    fireEvent.pointerUp(sw1, pointer);
    fireEvent.click(sw1);

    const state = usePacerStore.getState();
    expect(state.log).toEqual([]); // the old press's release must not reach the new session
    expect(state.selectedControlId).toBeUndefined();
    expect(state.board.controls).toEqual({});
    expect(switchButton("1").getAttribute("aria-pressed")).toBe("false");
    act(() => usePacerStore.getState().deleteSavedConfig(state.activeConfigId!));
  });

  it("the Configurations panel lists saved snapshots and switches between them", async () => {
    const fixture = new Uint8Array(readFileSync("fixtures/factory-presets.syx"));
    act(() => usePacerStore.getState().importSyxFile("gig-rig.syx", fixture));
    render(<App />);
    // Opening a configuration closes the drawer, so each visit re-opens it and re-queries the list.
    const openList = () => {
      openDeviceDrawer();
      return screen.getByRole("list", { name: "Saved configurations" });
    };
    let list = openList();
    expect(within(list).getByText("gig-rig")).toBeTruthy();
    expect(within(list).getByText(/Imported gig-rig.syx .* 24 presets$/)).toBeTruthy(); // no firmware for files

    // Rename inline.
    fireEvent.click(within(list).getByRole("button", { name: "Rename" }));
    const input = within(list).getByRole("textbox", { name: "Configuration name" });
    fireEvent.change(input, { target: { value: "Friday gig" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(within(list).getByText("Friday gig")).toBeTruthy();

    // Clicking a row opens it (and only in the simulator) and dismisses the drawer.
    fireEvent.click(within(list).getByRole("button", { name: /^Factory defaults/ }));
    expect(usePacerStore.getState().activeConfigId).toBeUndefined();
    expect(screen.queryByRole("list", { name: "Saved configurations" })).toBeNull();

    list = openList();
    expect(
      within(list)
        .getByRole("button", { name: /^Factory defaults/ })
        .getAttribute("aria-current"),
    ).toBe("true");
    fireEvent.click(within(list).getByRole("button", { name: /^Friday gig/ }));
    expect(usePacerStore.getState().configSource).toBe("Friday gig");

    list = openList();
    fireEvent.click(within(list).getByRole("button", { name: /^Factory defaults/ }));

    // Delete the snapshot (two clicks).
    list = openList();
    fireEvent.click(within(list).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(list).getByRole("button", { name: "Confirm delete" }));
    expect(within(list).queryByText("Friday gig")).toBeNull();
  });

  it("shows the preset's name and label on the display, in Play mode as well as Edit", () => {
    render(<App />);
    expect(displayName().trim()).toBe("PRGM1"); // Play mode: the readout still reads out
    expect(display()).toBe("A1");
    expect(screen.getByRole("group", { name: /Pacer faceplate/ }).textContent).toContain("PRGM1");

    act(() => usePacerStore.getState().setUiMode("program"));
    expect(displayName().trim()).toBe("PRGM1");
    act(() => usePacerStore.getState().setUiMode("simulate"));
    expect(displayName().trim()).toBe("PRGM1");
  });

  it("pressing a switch logs its MIDI output and marks it held", () => {
    render(<App />);
    const sw1 = switchButton("1");
    hold(sw1);
    expect(sw1.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("log").textContent).toContain("Program Change 0");
    fireEvent.keyUp(sw1, { key: " " });
    expect(sw1.getAttribute("aria-pressed")).toBe("false");
  });

  it("C/D step through presets", () => {
    render(<App />);
    tap(switchButton("C"));
    expect(display()).toBe("D6");
    tap(switchButton("D"));
    tap(switchButton("D"));
    expect(display()).toBe("A2");
  });

  it("holding Preset, then bank + number, selects a preset", () => {
    vi.useFakeTimers();
    render(<App />);
    const preset = screen.getByRole("button", { name: /^Preset button/ });
    hold(preset);
    act(() => vi.advanceTimersByTime(PRESET_HOLD_MS));
    fireEvent.keyUp(preset, { key: " " });
    vi.useRealTimers();
    expect(display()).toBe("A-");
    tap(switchButton("B"));
    expect(display()).toBe("B-");
    tap(switchButton("1"));
    expect(display()).toBe("B1");
  });

  it("a mouse long-press on Preset enters preset select, even if focus moves mid-hold", () => {
    vi.useFakeTimers();
    render(<App />);
    const preset = screen.getByRole("button", { name: /^Preset button/ });
    const pointer = { pointerId: 1, pointerType: "mouse", button: 0, width: 1, height: 1, pressure: 0.5 };
    fireEvent.pointerDown(preset, pointer);
    fireEvent.blur(preset); // e.g. the first click into an inactive browser window
    act(() => vi.advanceTimersByTime(PRESET_HOLD_MS));
    fireEvent.pointerUp(preset, pointer);
    fireEvent.click(preset);
    vi.useRealTimers();
    expect(display()).toBe("A-");
    expect(usePacerStore.getState().deviceMode.presetButtonDown).toBe(false);
  });

  it("a touch long-press on Preset (no click afterwards, as on iOS/Android) still ends the press", () => {
    vi.useFakeTimers();
    render(<App />);
    const preset = screen.getByRole("button", { name: /^Preset button/ });
    const touch = { pointerId: 2, pointerType: "touch", button: 0, width: 20, height: 20, pressure: 0.5 };
    fireEvent.pointerDown(preset, touch);
    act(() => vi.advanceTimersByTime(PRESET_HOLD_MS));
    fireEvent.pointerUp(preset, touch);
    act(() => vi.advanceTimersByTime(100)); // React Aria's synthetic-click fallback
    vi.useRealTimers();
    expect(display()).toBe("A-");
    expect(usePacerStore.getState().deviceMode.presetButtonDown).toBe(false);
  });

  it("a mouse click on a switch presses and releases it", () => {
    render(<App />);
    const sw1 = switchButton("1");
    const pointer = { pointerId: 1, pointerType: "mouse", button: 0, width: 1, height: 1, pressure: 0.5 };
    fireEvent.pointerDown(sw1, pointer);
    expect(sw1.getAttribute("aria-pressed")).toBe("true");
    fireEvent.pointerUp(sw1, pointer);
    fireEvent.click(sw1); // browsers follow pointerup with click, which is what ends a usePress press
    expect(sw1.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("log").textContent).toContain("Program Change 0");
  });

  it("preset select: 1-6 flash dim except the loaded preset's number (solid bright); [Preset] flashes", () => {
    act(() => usePacerStore.getState().jumpToPreset(userPresetIndex(0, 3))); // A3
    vi.useFakeTimers();
    render(<App />);
    const preset = screen.getByRole("button", { name: /^Preset button/ });
    hold(preset);
    act(() => vi.advanceTimersByTime(PRESET_HOLD_MS));
    fireEvent.keyUp(preset, { key: " " });
    vi.useRealTimers();

    const led = (el: Element) => [el.getAttribute("data-led"), el.getAttribute("data-led-flashing")];
    expect(led(preset)).toEqual(["bright", "true"]);
    expect(led(switchButton("3"))).toEqual(["bright", "false"]);
    for (const n of ["1", "2", "4", "5", "6"]) expect(led(switchButton(n))).toEqual(["dim", "true"]);
    expect(led(switchButton("A"))).toEqual(["bright", "false"]);
    expect(led(switchButton("B"))).toEqual(["off", "false"]);

    tap(switchButton("B")); // another bank: no loaded preset among 1-6
    expect(led(switchButton("3"))).toEqual(["dim", "true"]);
  });

  it("jumps to a preset from the chooser, and marks the ones edited since opening", () => {
    render(<App />);
    const openChooser = () => fireEvent.click(screen.getByRole("button", { name: /^Preset: / }));
    openChooser();
    fireEvent.click(screen.getByRole("option", { name: "B2 HELX2" }));
    expect(usePacerStore.getState().board.activePresetIndex).toBe(userPresetIndex(1, 2));
    expect(display()).toBe("B2");
    expect(displayName()).toBe("HELX2");

    // An edit to A1 marks A1 alone, wherever you happen to be standing.
    act(() => usePacerStore.getState().applyEdit((c) => renamePreset(c, userPresetIndex(0, 1), "LOOP")));
    openChooser();
    expect(screen.getByRole("option", { name: /^A1 LOOP.*edited/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: "B2 HELX2" })).toBeTruthy(); // unmarked
  });

  it("A enters the Track preset; a [Preset] tap returns to the remembered preset", () => {
    act(() => usePacerStore.getState().jumpToPreset(userPresetIndex(1, 2))); // B2
    render(<App />);
    tap(switchButton("A"));
    expect(display()).toBe("↩B2");
    expect(screen.getByRole("button", { name: "Switch C: Previous track" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch 1: Solo" })).toBeTruthy();
    tap(screen.getByRole("button", { name: /^Preset button \(tap: back to B2/ }));
    expect(display()).toBe("B2");
    expect(screen.getByRole("button", { name: "Switch C: P−" })).toBeTruthy();
  });
});
