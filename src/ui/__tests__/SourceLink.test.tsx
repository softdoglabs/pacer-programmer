// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { REPO_URL } from "../../docsSite";
import { SourceLink } from "../SourceLink";

afterEach(cleanup);

describe("the link to the source", () => {
  it("goes to the repository on GitHub, in a tab of its own, and says so to a screen reader", () => {
    render(<SourceLink />);
    const link = screen.getByRole("link", { name: "Source code on GitHub" });
    expect(link.getAttribute("href")).toBe(REPO_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
  });
});
