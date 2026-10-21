// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/*
 * Optional branding, added at build time from the Soft Dog Labs brand kit, which is kept in its own
 * private repository (softdoglabs/brandkit).
 *
 * The code is GPL; the brand isn't, and putting it in this repository would hand every fork a copy
 * (see TRADEMARKS.md). So a build is branded only when PACER_BRAND_DIR names a checkout of the kit;
 * otherwise it has a neutral icon and the stock docs theme. Either way it credits its maker
 * (maker.ts).
 *
 * The kit is read as it's laid out (KIT_FILES), not through a manifest of our own, so its repository
 * stays a brand kit rather than a dependency of this one. A file this needs that's missing fails the
 * build: a deploy meant to be branded can't quietly go out neutral.
 *
 * The app reads the result as `virtual:brand` and `virtual:brand-app.css`, the docs theme as
 * `virtual:brand-docs.css`. Node-only: this runs in the build, never in the browser.
 */

import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { searchForWorkspaceRoot, type Plugin } from "vite";

export const BRAND_ENV = "PACER_BRAND_DIR";
const NEUTRAL_FAVICON = resolve(import.meta.dirname, "../../public/favicon.svg");

/** The kit's files this uses, by their paths in the kit. */
const KIT_FILES = {
  /**
   * The horizontal lockup, dog and name, for dark backgrounds (the app's) and light ones. The dark
   * one is the kit's transparent version: the plain dark one brings its own navy box. Both have
   * clear space built in, 40 units of their 300 high on each side.
   */
  lockupOnDark: "svg/dark-transparent/softdog-horizontal-dark-transparent.svg",
  lockupOnLight: "svg/color/softdog-horizontal-color.svg",
  /** The dog on its own, for where the lockup won't fit (the docs' top bar on a phone). */
  markOnDark: "svg/mark/softdog-mark-dark.svg",
  markOnLight: "svg/mark/softdog-mark-color.svg",
  /** The app icon, navy, at the sizes a tab and a home screen ask for. */
  favicon: "png/app-icon-sizes/softdog-app-icon-dark-32.png",
  appleTouchIcon: "png/app-icon-sizes/softdog-app-icon-dark-180.png",
  /** Colour tokens (light and dark) and the two web fonts. */
  colors: "colors/softdog-colors.css",
  fonts: "fonts/web/softdog-fonts.css",
} as const;

export type BrandKit = Record<keyof typeof KIT_FILES, string>;

/** The kit checked out at `dir`, as absolute paths, or null for a neutral build. */
export function readBrandKit(dir: string | undefined): BrandKit | null {
  if (!dir) return null;
  const root = resolve(dir);
  const missing = Object.values(KIT_FILES).filter((path) => !existsSync(join(root, path)));
  if (missing.length) throw new Error(`${BRAND_ENV} is ${dir}, which isn't the brand kit: no ${missing.join(", ")}.`);
  return Object.fromEntries(Object.entries(KIT_FILES).map(([key, path]) => [key, join(root, path)])) as BrandKit;
}

/** The source of `virtual:brand` for a kit. */
export function brandModule(kit: BrandKit | null): string {
  if (!kit) return "export const brand = null;\n";
  return `import lockupUrl from ${JSON.stringify(`${kit.lockupOnDark}?url`)};\nexport const brand = { lockupUrl };\n`;
}

/** The `<link>`s for a page's tab and home-screen icons, at `base`: the kit's, or the neutral one. */
export function iconLinks(kit: BrandKit | null, base: string): Record<string, string>[] {
  if (!kit) return [{ rel: "icon", type: "image/svg+xml", href: `${base}favicon.svg` }];
  return [
    { rel: "icon", type: "image/png", sizes: "32x32", href: `${base}brand/favicon.png` },
    { rel: "apple-touch-icon", href: `${base}brand/apple-touch-icon.png` },
  ];
}

/** Files a page links to by a fixed address, by that address under the base. */
function brandFiles(kit: BrandKit, docs: boolean): Record<string, string> {
  return {
    "brand/favicon.png": kit.favicon,
    "brand/apple-touch-icon.png": kit.appleTouchIcon,
    ...(docs
      ? {
          "brand/lockup-light.svg": kit.lockupOnLight,
          "brand/lockup-dark.svg": kit.lockupOnDark,
          "brand/mark-light.svg": kit.markOnLight,
          "brand/mark-dark.svg": kit.markOnDark,
        }
      : {}),
  };
}

/** Serves `files` in development and emits them in a build. */
function fixedFiles(files: Record<string, string>): Pick<Plugin, "configureServer" | "generateBundle"> {
  const types: Record<string, string> = { ".png": "image/png", ".svg": "image/svg+xml" };
  return {
    configureServer(server) {
      for (const [name, file] of Object.entries(files)) {
        server.middlewares.use(`${server.config.base}${name}`, (_req, res) => {
          res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
          res.end(readFileSync(file));
        });
      }
    },
    generateBundle() {
      for (const [name, file] of Object.entries(files))
        this.emitFile({ type: "asset", fileName: name, source: readFileSync(file) });
    },
  };
}

/** The kit lives outside the repository, so the dev server has to be let in, as well as where it reads anyway. */
function allowKit(kit: BrandKit | null, dir: string | undefined) {
  if (!kit || !dir) return undefined;
  return { server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), resolve(dir)] } } };
}

/** A stylesheet that imports `files`, in order. */
function cssImports(files: string[]): string {
  return files.map((file) => `@import ${JSON.stringify(file)};`).join("\n") + "\n";
}

/** The source of `virtual:brand-app.css`: the kit's colours, then `themeCss` mapping them. */
export function brandAppCss(kit: BrandKit | null, themeCss: string): string {
  return kit ? cssImports([kit.colors, themeCss]) : "";
}

/**
 * The app's branding (vite.config.ts): the lockup, the icons, and the kit's dark palette under the
 * app's own colours (app.css). The app is dark only, so the page says so to the kit, whose tokens
 * otherwise follow the OS.
 */
export function brandPlugin(dir = process.env[BRAND_ENV]): Plugin {
  const kit = readBrandKit(dir);
  const MODULE = "virtual:brand";
  const CSS = "virtual:brand-app.css";
  const themeCss = resolve(import.meta.dirname, "app.css");
  return {
    name: "pacer-brand",
    config: () => allowKit(kit, dir),
    resolveId: (id) => (id === MODULE || id === CSS ? `\0${id}` : undefined),
    load(id) {
      if (id === `\0${MODULE}`) return brandModule(kit);
      // Ends in .css, so Vite treats it as a stylesheet.
      if (id === `\0${CSS}`) return brandAppCss(kit, themeCss);
    },
    transformIndexHtml: (html) => ({
      html: kit ? html.replace(/<html\b/, '<html data-theme="dark"') : html,
      tags: iconLinks(kit, "/").map((attrs) => ({ tag: "link", attrs, injectTo: "head" as const })),
    }),
    ...(kit ? fixedFiles(brandFiles(kit, false)) : {}),
  };
}

/** The source of `virtual:brand-docs.css`: the kit's fonts and colours, then `themeCss` mapping them. */
export function brandDocsCss(kit: BrandKit | null, themeCss: string): string {
  return kit ? cssImports([kit.fonts, kit.colors, themeCss]) : "";
}

/**
 * The docs site's branding (docs/.vitepress/config.ts): the theme's stylesheet, and the lockups and
 * icons at fixed addresses, since the theme's logo and the page head name files rather than
 * importing them. The config adds the icons to the head with iconLinks.
 */
export function brandDocsPlugin(kit: BrandKit | null, dir: string | undefined, themeCss: string): Plugin {
  const MODULE = "virtual:brand-docs.css";
  return {
    name: "pacer-brand-docs",
    config: () => allowKit(kit, dir),
    resolveId: (id) => (id === MODULE ? `\0${MODULE}` : undefined),
    // Ends in .css, so Vite treats it as a stylesheet.
    load: (id) => (id === `\0${MODULE}` ? brandDocsCss(kit, themeCss) : undefined),
    // The neutral icon too: the app has it in public/, which the docs site doesn't share.
    ...fixedFiles(kit ? brandFiles(kit, true) : { "favicon.svg": NEUTRAL_FAVICON }),
  };
}
