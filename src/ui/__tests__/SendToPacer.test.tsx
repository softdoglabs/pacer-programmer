// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renamePreset } from "../../pacer/editing";
import { loadFactoryDefaults } from "../../pacer/factoryDefaults";
import { userPresetIndex } from "../../pacer/protocol/constants";
import { usePacerStore } from "../../store/pacerStore";
import { SendToPacer } from "../editor/SendToPacer";

const store = () => usePacerStore.getState();
const C1 = userPresetIndex(2, 1);

function tap(el: Element) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
  });
}

beforeEach(() => {
  act(() => {
    store().loadConfig(loadFactoryDefaults(), "Factory defaults");
    usePacerStore.setState({
      midi: { status: "connected", outputs: [{ id: "out", name: "PACER" }], inputs: [], sysexEnabled: true },
      pacerPorts: { outputId: "out" },
      send: { status: "idle" },
    });
  });
});
afterEach(cleanup);

describe("Send to Pacer", () => {
  it("is unavailable without a connected Pacer", () => {
    act(() => usePacerStore.setState({ pacerPorts: {} }));
    render(<SendToPacer />);
    expect(screen.getByRole("button", { name: "Send to Pacer…" }).hasAttribute("disabled")).toBe(true);
  });

  it("defaults to the changed presets, lists what gets overwritten, and sends only on confirmation", () => {
    act(() => store().applyEdit((c) => renamePreset(c, C1, "LOOPR")));
    const sendToPacer = vi.fn(async () => {});
    act(() => usePacerStore.setState({ sendToPacer }));
    render(<SendToPacer />);
    tap(screen.getByRole("button", { name: "Send to Pacer…" }));

    expect(screen.getByRole("radio", { name: "Changed (1)" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("C1 LOOPR")).toBeTruthy();
    expect(sendToPacer).not.toHaveBeenCalled();

    tap(screen.getByRole("button", { name: "Overwrite 1 preset on the Pacer" }));
    expect(sendToPacer).toHaveBeenCalledWith([C1], { verify: true });
  });

  it("with nothing changed, starts on the current preset", () => {
    render(<SendToPacer />);
    tap(screen.getByRole("button", { name: "Send to Pacer…" }));
    expect(screen.getByRole("radio", { name: "This preset (A1)" }).getAttribute("aria-checked")).toBe("true");
    tap(screen.getByRole("radio", { name: "All (24)" }));
    expect(screen.getByRole("button", { name: "Overwrite 24 presets on the Pacer" })).toBeTruthy();
  });
});
