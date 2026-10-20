// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppTitle } from "../AppTitle";

const brand = vi.hoisted(() => ({ current: null as { lockupUrl: string } | null }));
vi.mock("virtual:brand", () => ({
  get brand() {
    return brand.current;
  },
}));

afterEach(() => {
  cleanup();
  brand.current = null;
});

function expectMakerLink(link: HTMLElement) {
  expect(link.getAttribute("href")).toBe("https://softdoglabs.com");
  expect(link.getAttribute("target")).toBe("_blank");
  // noopener for safety, but not noreferrer: the visit should be seen to come from here.
  expect(link.getAttribute("rel")).toBe("noopener");
}

describe("the app's title", () => {
  it("credits its maker in every build, linking to their site", () => {
    render(<AppTitle />);
    expect(screen.getByRole("heading", { name: "Pacer Programmer" })).toBeTruthy();
    expectMakerLink(screen.getByRole("link", { name: "by Soft Dog Labs" }));
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("puts the maker's lockup in place of the words in a branded build, still linking to them", () => {
    brand.current = { lockupUrl: "/assets/lockup.svg" };
    render(<AppTitle />);
    expect(screen.getByRole("heading", { name: "Pacer Programmer" })).toBeTruthy();
    const link = screen.getByRole("link", { name: "Soft Dog Labs" });
    expectMakerLink(link);
    expect(link.querySelector("img")?.getAttribute("src")).toBe("/assets/lockup.svg");
  });
});
