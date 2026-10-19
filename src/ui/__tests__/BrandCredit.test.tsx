// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandCredit } from "../BrandCredit";

const brand = vi.hoisted(() => ({ current: null as { name: string; url: string; logoUrl?: string } | null }));
vi.mock("virtual:brand", () => ({
  get brand() {
    return brand.current;
  },
}));

afterEach(() => {
  cleanup();
  brand.current = null;
});

describe("the brand credit", () => {
  it("isn't there in a neutral build", () => {
    const { container } = render(<BrandCredit />);
    expect(container.innerHTML).toBe("");
  });

  it("names the maker and links to them, in a tab of its own, keeping the referrer", () => {
    brand.current = { name: "Example Co", url: "https://example.com" };
    render(<BrandCredit />);
    const link = screen.getByRole("link", { name: "by Example Co" });
    expect(link.getAttribute("href")).toBe("https://example.com");
    expect(link.getAttribute("target")).toBe("_blank");
    // noopener for safety, but not noreferrer: the visit should be seen to come from here.
    expect(link.getAttribute("rel")).toBe("noopener");
  });

  it("shows the kit's logo beside it, as decoration", () => {
    brand.current = { name: "Example Co", url: "https://example.com", logoUrl: "/assets/logo.svg" };
    render(<BrandCredit />);
    const logo = screen.getByRole("link").querySelector("img");
    expect(logo?.getAttribute("src")).toBe("/assets/logo.svg");
    expect(logo?.getAttribute("alt")).toBe("");
  });
});
