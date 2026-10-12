// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { usePacerStore } from "../../store/pacerStore";

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  act(() => usePacerStore.getState().setDeviceDrawerOpen(true));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the configurations list", () => {
  it("exports the factory defaults like any snapshot, byte for byte", async () => {
    // jsdom has no object URLs; catch what would have been downloaded.
    let downloaded: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      downloaded = blob;
      return "blob:factory";
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<App />);
    const list = screen.getByRole("list", { name: "Saved configurations" });
    const factory = within(list).getByText("Factory defaults").closest("li")!;
    fireEvent.click(within(factory).getByRole("button", { name: "Export .syx" }));

    expect(downloaded).toBeDefined();
    const bytes = new Uint8Array(await downloaded!.arrayBuffer());
    expect(bytes).toEqual(new Uint8Array(readFileSync("fixtures/factory-presets.syx")));
  });
});
