// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../../App";
import { loadFactoryDefaults } from "../../pacer/factoryDefaults";
import { ControlId } from "../../pacer/protocol/constants";
import { usePacerStore } from "../../store/pacerStore";
import type { AppLocation } from "../appHistory";

const store = () => usePacerStore.getState();
const here = () => window.history.state as AppLocation | null;

/** jsdom doesn't traverse history, so a Back is the entry we know precedes this one, replayed. */
function back(to: Omit<AppLocation, "n">) {
  act(() => {
    window.history.replaceState({ ...to, n: Math.max(0, (here()?.n ?? 1) - 1) }, "");
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  });
}

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.history.replaceState(null, "");
  act(() => {
    store().loadConfig(loadFactoryDefaults(), "Factory defaults");
    store().setUiMode("simulate");
    store().setDeviceDrawerOpen(false);
  });
});
afterEach(cleanup);

describe("browser navigation", () => {
  it("makes each place a history entry, and none for the first load", () => {
    render(<App />);
    expect(here()).toMatchObject({ mode: "simulate", drawer: false, n: 0 });

    fireEvent.click(screen.getByRole("radio", { name: "Program" }));
    expect(here()).toMatchObject({ mode: "program", n: 1 });

    // One reference: the press selects the control, which replaces the faceplate with its editor.
    const sw1 = screen.getByRole("button", { name: /^Switch 1:/ });
    fireEvent.keyDown(sw1, { key: " " });
    fireEvent.keyUp(sw1, { key: " " });
    expect(here()).toMatchObject({ mode: "program", controlId: ControlId.Stompswitch1, n: 2 });
  });

  it("Back returns to where you came from, and doesn't re-push on the way", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("radio", { name: "Program" }));
    const sw1 = screen.getByRole("button", { name: /^Switch 1:/ });
    fireEvent.keyDown(sw1, { key: " " });
    fireEvent.keyUp(sw1, { key: " " });
    expect(screen.getByRole("region", { name: "Step 1" })).toBeTruthy();

    back({ mode: "program", controlId: undefined, drawer: false });
    expect(store().selectedControlId).toBeUndefined();
    expect(store().uiMode).toBe("program"); // still programming, just back at the faceplate
    expect(screen.queryByRole("region", { name: "Step 1" })).toBeNull();
    expect(here()?.n).toBe(1); // returning to an entry mustn't push a new one

    back({ mode: "simulate", controlId: undefined, drawer: false });
    expect(store().uiMode).toBe("simulate");
    expect(here()?.n).toBe(0);
  });

  it("counts the device drawer as a place, so Back closes it", () => {
    render(<App />);
    fireEvent.click(screen.getByTitle("Open configurations and the Pacer connection").querySelector("button")!);
    expect(store().deviceDrawerOpen).toBe(true);
    expect(here()).toMatchObject({ drawer: true, n: 1 });

    back({ mode: "simulate", controlId: undefined, drawer: false });
    expect(store().deviceDrawerOpen).toBe(false);
  });
});
