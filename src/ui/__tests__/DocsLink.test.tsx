// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../../App";
import { DOCS_URL, REPOSITORY_URL } from "../DocsLink";

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

describe("the docs link", () => {
  it("sends you to the docs on GitHub, in a tab of their own", () => {
    render(<App />);
    const link = screen.getByRole("link", { name: "Docs" });
    expect(link.getAttribute("href")).toBe(DOCS_URL);
    expect(DOCS_URL.startsWith(`${REPOSITORY_URL}/`)).toBe(true);
    // Beside the app, so a tutorial can be followed while doing it.
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
