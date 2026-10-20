// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { brandDocsCss, brandModule, iconLinks, readBrandKit } from "../vitePlugin";

/** The files the kit has to have, by their paths in softdoglabs/brandkit. */
const KIT = [
  "svg/mark/softdog-mark-dark.svg",
  "svg/mark/softdog-mark-color.svg",
  "png/app-icon-sizes/softdog-app-icon-dark-32.png",
  "png/app-icon-sizes/softdog-app-icon-dark-180.png",
  "colors/softdog-colors.css",
  "fonts/web/softdog-fonts.css",
];

function kitWith(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "brandkit-"));
  for (const file of files) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), "");
  }
  return dir;
}

describe("the brand kit", () => {
  it("is optional: without one the build is neutral", () => {
    expect(readBrandKit(undefined)).toBeNull();
    expect(readBrandKit("")).toBeNull();
    expect(brandModule(null)).toBe("export const brand = null;\n");
    expect(brandDocsCss(null, "/theme/brand.css")).toBe("");
    expect(iconLinks(null, "/")).toEqual([{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }]);
  });

  it("is read as the kit lays it out", () => {
    const dir = kitWith(KIT);
    const kit = readBrandKit(dir);
    expect(kit?.markOnDark).toBe(join(dir, "svg/mark/softdog-mark-dark.svg"));
    expect(kit?.colors).toBe(join(dir, "colors/softdog-colors.css"));
  });

  // A deploy that meant to be branded and silently wasn't would go unnoticed.
  it("fails the build when what it names isn't the kit, saying what's missing", () => {
    expect(() => readBrandKit(kitWith(KIT.slice(1)))).toThrow(
      /isn't the brand kit: no svg\/mark\/softdog-mark-dark\.svg/,
    );
  });

  it("gives the app its logo and icons, and the docs the kit's fonts and colours before the theme's mapping", () => {
    const dir = kitWith(KIT);
    const kit = readBrandKit(dir)!;
    expect(brandModule(kit)).toContain(`import logoUrl from ${JSON.stringify(`${kit.markOnDark}?url`)};`);
    expect(iconLinks(kit, "/docs/x/").map((link) => link.href)).toEqual([
      "/docs/x/brand/favicon.png",
      "/docs/x/brand/apple-touch-icon.png",
    ]);
    const css = brandDocsCss(kit, "/theme/brand.css").trim().split("\n");
    expect(css).toEqual([kit.fonts, kit.colors, "/theme/brand.css"].map((f) => `@import ${JSON.stringify(f)};`));
  });
});
