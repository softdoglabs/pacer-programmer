// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandCredit } from "../BrandCredit";

const brand = vi.hoisted(() => ({ current: null as { logoUrl: string } | null }));
vi.mock("virtual:brand", () => ({
  get brand() {
    return brand.current;
  },
}));

afterEach(() => {
  cleanup();
  brand.current = null;
});

describe("the maker's credit", () => {
  it("is in every build, linking to their site in a tab of its own and keeping the referrer", () => {
    render(<BrandCredit />);
    const link = screen.getByRole("link", { name: "by Soft Dog Labs" });
    expect(link.getAttribute("href")).toBe("https://softdoglabs.com");
    expect(link.getAttribute("target")).toBe("_blank");
    // noopener for safety, but not noreferrer: the visit should be seen to come from here.
    expect(link.getAttribute("rel")).toBe("noopener");
    expect(link.querySelector("img")).toBeNull();
  });

  it("carries the logo in a branded build, as decoration", () => {
    brand.current = { logoUrl: "/assets/mark.svg" };
    render(<BrandCredit />);
    const logo = screen.getByRole("link", { name: "by Soft Dog Labs" }).querySelector("img");
    expect(logo?.getAttribute("src")).toBe("/assets/mark.svg");
    expect(logo?.getAttribute("alt")).toBe("");
  });
});
