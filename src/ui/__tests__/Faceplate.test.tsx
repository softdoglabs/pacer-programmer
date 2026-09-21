// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRESET_HOLD_MS } from "../../pacer/device";
import { loadFactoryDefaults } from "../../pacer/factoryDefaults";
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
const switchButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^Switch ${name}:`) });

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

  it("the Factory defaults button reloads the factory config", () => {
    render(<App />);
    tap(switchButton("D"));
    expect(display()).toBe("A2");
    fireEvent.click(screen.getByRole("button", { name: "Factory defaults" }));
    expect(display()).toBe("A1");
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

  it("preset select: 1-6 flash dim except the loaded preset's number (solid bright); [Preset] flashes", () => {
    act(() => usePacerStore.getState().jumpToPreset(2)); // A3
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

  it("the inspector shows the pressed control's steps", () => {
    render(<App />);
    tap(switchButton("2"));
    expect(screen.getByRole("heading", { name: "Stomp 2" })).toBeTruthy();
    expect(screen.getByText("All steps at once")).toBeTruthy();
  });

  it("A enters the Track preset; a [Preset] tap returns to the remembered preset", () => {
    act(() => usePacerStore.getState().jumpToPreset(7)); // B2
    render(<App />);
    tap(switchButton("A"));
    expect(display()).toBe("↩B2");
    expect(screen.getByRole("button", { name: "Switch C: Trk ▼" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch 1: Solo" })).toBeTruthy();
    tap(screen.getByRole("button", { name: /^Preset button \(tap: back to B2/ }));
    expect(display()).toBe("B2");
    expect(screen.getByRole("button", { name: "Switch C: P−" })).toBeTruthy();
  });
});
