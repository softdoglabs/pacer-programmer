// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { brandAppCss, brandDocsCss, brandModule, iconLinks, readBrandKit, webAppManifest } from "../vitePlugin";

/** The files the kit has to have, by their paths in softdoglabs/brandkit. */
const KIT = [
  "svg/dark-transparent/softdog-horizontal-dark-transparent.svg",
  "svg/color/softdog-horizontal-color.svg",
  "svg/mark/softdog-mark-dark.svg",
  "svg/mark/softdog-mark-color.svg",
  "png/app-icon-sizes/softdog-app-icon-dark-32.png",
  "png/app-icon-sizes/softdog-app-icon-dark-180.png",
  "png/app-icon-sizes/softdog-app-icon-dark-512.png",
  "svg/dark/softdog-app-icon-dark.svg",
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
    expect(brandAppCss(null, "/brand/app.css")).toBe("");
    expect(brandDocsCss(null, "/theme/brand.css")).toBe("");
    expect(iconLinks(null, "/")).toEqual([{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }]);
  });

  it("is read as the kit lays it out", () => {
    const dir = kitWith(KIT);
    const kit = readBrandKit(dir);
    expect(kit?.lockupOnDark).toBe(join(dir, "svg/dark-transparent/softdog-horizontal-dark-transparent.svg"));
    expect(kit?.colors).toBe(join(dir, "colors/softdog-colors.css"));
  });

  // A deploy that meant to be branded and silently wasn't would go unnoticed.
  it("fails the build when what it names isn't the kit, saying what's missing", () => {
    expect(() => readBrandKit(kitWith(KIT.slice(1)))).toThrow(
      /isn't the brand kit: no svg\/dark-transparent\/softdog-horizontal-dark-transparent\.svg/,
    );
  });

  it("gives the app its lockup, icons and colours, and the docs the kit's fonts and colours, each before the mapping", () => {
    const dir = kitWith(KIT);
    const kit = readBrandKit(dir)!;
    expect(brandModule(kit)).toContain(`import lockupUrl from ${JSON.stringify(`${kit.lockupOnDark}?url`)};`);
    expect(iconLinks(kit, "/docs/x/").map((link) => link.href)).toEqual([
      "/docs/x/brand/favicon.png",
      "/docs/x/brand/apple-touch-icon.png",
    ]);
    const appCss = brandAppCss(kit, "/brand/app.css").trim().split("\n");
    expect(appCss).toEqual([kit.colors, "/brand/app.css"].map((f) => `@import ${JSON.stringify(f)};`));
    const css = brandDocsCss(kit, "/theme/brand.css").trim().split("\n");
    expect(css).toEqual([kit.fonts, kit.colors, "/theme/brand.css"].map((f) => `@import ${JSON.stringify(f)};`));
  });
});

describe("the web app manifest", () => {
  // What Chromium needs before it offers to install (MDN, "Making PWAs installable").
  const installable = (manifest: Record<string, unknown>) => {
    expect(manifest.name).toBe("Pacer Programmer");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest).not.toHaveProperty("prefer_related_applications");
  };

  it("gives a branded build the kit's app icon as a drawing, with its 512 px PNG beside it", () => {
    const manifest = JSON.parse(webAppManifest(readBrandKit(kitWith(KIT))));
    installable(manifest);
    expect(manifest.icons).toEqual([
      { src: "/brand/app-icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/brand/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ]);
    expect(manifest.background_color).toBe("#081426");
  });

  it("gives a neutral build its SVG, at any size", () => {
    const manifest = JSON.parse(webAppManifest(null));
    installable(manifest);
    expect(manifest.icons).toEqual([{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }]);
  });
});
