// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brandModule, readBrandKit } from "../vitePlugin";

function kit(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "brand-"));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

const MANIFEST = JSON.stringify({ name: "Example Co", url: "https://example.com" });

describe("the brand kit", () => {
  it("is optional: without one the build is neutral", () => {
    expect(readBrandKit(undefined)).toBeNull();
    expect(readBrandKit("")).toBeNull();
    expect(brandModule(null)).toBe("export const brand = null;\n");
  });

  it("reads the name and address, and whichever optional files are there", () => {
    const dir = kit({ "brand.json": MANIFEST, "logo.svg": "<svg/>" });
    expect(readBrandKit(dir)).toEqual({
      name: "Example Co",
      url: "https://example.com",
      logo: join(dir, "logo.svg"),
      favicon: undefined,
    });
  });

  // A deploy that meant to be branded and silently wasn't would go unnoticed.
  it("fails the build when it's named but isn't a kit", () => {
    expect(() => readBrandKit(kit({}))).toThrow(/no brand.json/);
    expect(() => readBrandKit(kit({ "brand.json": JSON.stringify({ name: "Example Co" }) }))).toThrow(/https "url"/);
    expect(() =>
      readBrandKit(kit({ "brand.json": JSON.stringify({ name: "Example Co", url: "http://example.com" }) })),
    ).toThrow(/https "url"/);
  });

  it("gives the app its name, address and logo", () => {
    const source = brandModule({ name: "Example Co", url: "https://example.com", logo: "/kit/logo.svg" });
    expect(source).toContain('import logoUrl from "/kit/logo.svg?url";');
    expect(source).toContain('name: "Example Co", url: "https://example.com", logoUrl: logoUrl');
    expect(brandModule({ name: "Example Co", url: "https://example.com" })).toContain("logoUrl: undefined");
  });
});
