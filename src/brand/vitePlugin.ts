// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/*
 * Optional branding, added at build time from a brand kit kept outside this repository.
 *
 * The code is GPL; a brand isn't, and putting one in the repository would hand every fork a copy
 * of it (see TRADEMARKS.md). So the default build is neutral, and a build is branded only when
 * PACER_BRAND_DIR names a brand kit: a folder holding
 *
 *   brand.json     { "name": "…", "url": "https://…" }   required
 *   logo.svg       shown beside the credit                 optional
 *   favicon.svg    the browser tab's icon                  optional
 *
 * The app reads the result as `virtual:brand` (null when neutral), and the docs site reads the kit
 * through readBrandKit. Node-only: this runs in the build, never in the browser.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

export const BRAND_ENV = "PACER_BRAND_DIR";
const MODULE = "virtual:brand";
const RESOLVED = `\0${MODULE}`;
/** Where a kit's favicon is served from. The neutral one is public/favicon.svg. */
const BRAND_FAVICON = "brand-favicon.svg";

export interface BrandKit {
  name: string;
  url: string;
  /** Absolute paths of the kit's optional files. */
  logo?: string;
  favicon?: string;
}

/** The kit in `dir`, or null for a neutral build. A kit that's named but broken fails the build. */
export function readBrandKit(dir: string | undefined): BrandKit | null {
  if (!dir) return null;
  const root = resolve(dir);
  const manifest = join(root, "brand.json");
  if (!existsSync(manifest)) throw new Error(`${BRAND_ENV} is ${dir}, but there's no brand.json in it.`);
  const { name, url } = JSON.parse(readFileSync(manifest, "utf8")) as Record<string, unknown>;
  if (typeof name !== "string" || name.trim() === "" || typeof url !== "string" || !url.startsWith("https://")) {
    throw new Error(`${manifest} needs a "name" and an https "url".`);
  }
  const optional = (file: string) => (existsSync(join(root, file)) ? join(root, file) : undefined);
  return { name, url, logo: optional("logo.svg"), favicon: optional("favicon.svg") };
}

/** The source of `virtual:brand` for a kit. */
export function brandModule(kit: BrandKit | null): string {
  if (!kit) return "export const brand = null;\n";
  const logo = kit.logo ? `import logoUrl from ${JSON.stringify(`${kit.logo}?url`)};\n` : "";
  const fields = `name: ${JSON.stringify(kit.name)}, url: ${JSON.stringify(kit.url)}`;
  return `${logo}export const brand = { ${fields}, logoUrl: ${kit.logo ? "logoUrl" : "undefined"} };\n`;
}

export function brandPlugin(dir = process.env[BRAND_ENV]): Plugin {
  const kit = readBrandKit(dir);
  return {
    name: "pacer-brand",
    config: () => (dir && kit ? { server: { fs: { allow: [".", resolve(dir)] } } } : undefined),
    resolveId: (id) => (id === MODULE ? RESOLVED : undefined),
    load: (id) => (id === RESOLVED ? brandModule(kit) : undefined),

    // The tab icon: the kit's, if it has one, otherwise the neutral one in public/.
    transformIndexHtml: () => [
      {
        tag: "link",
        attrs: { rel: "icon", type: "image/svg+xml", href: kit?.favicon ? `/${BRAND_FAVICON}` : "/favicon.svg" },
        injectTo: "head",
      },
    ],
    configureServer(server) {
      const favicon = kit?.favicon;
      if (!favicon) return;
      server.middlewares.use(`/${BRAND_FAVICON}`, (_req, res) => {
        res.setHeader("Content-Type", "image/svg+xml");
        res.end(readFileSync(favicon));
      });
    },
    generateBundle() {
      if (kit?.favicon) this.emitFile({ type: "asset", fileName: BRAND_FAVICON, source: readFileSync(kit.favicon) });
    },
  };
}
