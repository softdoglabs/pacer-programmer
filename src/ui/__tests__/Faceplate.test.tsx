// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRESET_HOLD_MS } from "../../pacer/device";
import { decodeSysex } from "../../pacer/protocol/decode";
import { buildDemoConfig } from "../../pacer/simulator";
import { usePacerStore } from "../../store/pacerStore";
import { App } from "../../App";

function hold(el: Element) {
  fireEvent.keyDown(el, { key: " " });
}
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
  act(() => usePacerStore.getState().loadConfig(buildDemoConfig(), "Demo config"));
});
afterEach(cleanup);

describe("Faceplate", () => {
  it("shows the active preset and each switch's configured action", () => {
    render(<App />);
    expect(screen.getByTestId("display-line2").textContent).toBe("A1");
    expect(screen.getByRole("button", { name: "Switch A: PC5 →B1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch 6: —" })).toBeTruthy();
  });

  it("pressing a switch logs its MIDI output and marks it held", () => {
    render(<App />);
    const sw1 = screen.getByRole("button", { name: /^Switch 1:/ });
    hold(sw1);
    expect(sw1.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("log").textContent).toContain("CC#20 = 127");
    fireEvent.keyUp(sw1, { key: " " });
    expect(sw1.getAttribute("aria-pressed")).toBe("false");
  });

  it("follows a preset jump fired by a switch", () => {
    render(<App />);
    tap(screen.getByRole("button", { name: /^Switch A:/ }));
    expect(screen.getByTestId("display-line2").textContent).toBe("B1");
    expect(screen.getByRole("log").textContent).toContain("Program Change 5");
  });

  it("holding Preset, then bank + number, selects a preset", () => {
    vi.useFakeTimers();
    render(<App />);
    const preset = screen.getByRole("button", { name: /^Preset button/ });
    hold(preset);
    act(() => vi.advanceTimersByTime(PRESET_HOLD_MS));
    fireEvent.keyUp(preset, { key: " " });
    vi.useRealTimers();
    expect(screen.getByTestId("display-line2").textContent).toBe("A-");
    tap(screen.getByRole("button", { name: /^Switch B:/ }));
    expect(screen.getByTestId("display-line2").textContent).toBe("B-");
    tap(screen.getByRole("button", { name: /^Switch 1:/ }));
    expect(screen.getByTestId("display-line2").textContent).toBe("B1");
  });

  it("the inspector shows the pressed control's steps", () => {
    render(<App />);
    tap(screen.getByRole("button", { name: /^Switch 2:/ }));
    expect(screen.getByText("Sequence")).toBeTruthy();
  });

  it("factory A enters the Track preset; [Preset] returns to the remembered preset", () => {
    const config = decodeSysex(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
    act(() => usePacerStore.getState().loadConfig(config, "factory", 7)); // B2
    render(<App />);
    tap(screen.getByRole("button", { name: /^Switch A:/ }));
    expect(screen.getByTestId("display-line2").textContent).toBe("↩B2");
    expect(screen.getByRole("button", { name: "Switch C: Trk ▼" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch 1: Solo" })).toBeTruthy();
    tap(screen.getByRole("button", { name: /^Preset button \(tap: back to B2/ }));
    expect(screen.getByTestId("display-line2").textContent).toBe("B2");
    expect(screen.getByRole("button", { name: "Switch C: P−" })).toBeTruthy();
  });
});
