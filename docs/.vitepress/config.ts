// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/*
 * The docs as a website (`pnpm docs:build`), served at softdoglabs.com/docs/pacer-programmer/.
 *
 * The Markdown in docs/ is written for GitHub and stays that way: every page is a README.md or a
 * named page, linked by relative path, and it renders there unchanged. This config only adapts it:
 * README.md pages become each folder's index, and the sidebar is read from the front page's
 * Contents list, so the pages are listed and ordered in one place.
 */

import { copyFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { defineConfig, type DefaultTheme } from "vitepress";
import { MAKER } from "../../src/brand/maker";
import { BRAND_ENV, brandDocsPlugin, iconLinks, readBrandKit } from "../../src/brand/vitePlugin";

export const SITE = "https://softdoglabs.com";
export const BASE = "/docs/pacer-programmer/";
const REPOSITORY = "https://github.com/softdoglabs/pacer-programmer";
/** The same optional brand kit as the app's (src/brand/vitePlugin.ts): neutral without one. */
const brandDir = process.env[BRAND_ENV];
const brand = readBrandKit(brandDir);

const DOCS = resolve(import.meta.dirname, "..");
/** Built under its own path, so the Worker serving it finds `/docs/pacer-programmer/...` there. */
const OUT = resolve(DOCS, "../build/docs-site/docs/pacer-programmer");

/** A link in docs/README.md, as the site addresses it: `guide/README.md` -> `/guide/`. */
function sitePath(link: string): string {
  return "/" + link.replace(/(^|\/)README\.md$/, "$1").replace(/\.md$/, "");
}

/**
 * A heading's anchor as GitHub makes it: lowercased, punctuation dropped, spaces to hyphens.
 * VitePress's own turns an apostrophe into a hyphen, so "What It Can't Do" wouldn't be
 * #what-it-cant-do. Same rule as src/test/docsLinks.test.ts.
 */
export function githubSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/ /g, "-");
}

/** A relative link to a folder's README.md, as a link to the page the site builds from it. */
export function readmeToIndex(href: string): string {
  return href.replace(/(^|\/)README\.md(?=#|$)/, "$1index.md");
}

/**
 * The sidebar, from the front page's Contents section: each `[Section](folder/README.md): ...` line
 * starts a group, and the list under it is the group's pages, in order.
 */
export function sidebarFrom(frontPage: string): DefaultTheme.SidebarItem[] {
  const contents = frontPage.split(/^## Contents$/m)[1]?.split(/^## /m)[0] ?? "";
  const groups: DefaultTheme.SidebarItem[] = [];
  for (const line of contents.split("\n")) {
    const section = /^\[([^\]]+)\]\(([^)]+)\)/.exec(line);
    const page = /^(?:-|\d+\.) \[([^\]]+)\]\(([^)]+)\)/.exec(line);
    if (section) groups.push({ text: section[1], link: sitePath(section[2]!), items: [] });
    else if (page) groups.at(-1)?.items?.push({ text: page[1], link: sitePath(page[2]!) });
  }
  return groups.map((group) => (group.items?.length ? group : { text: group.text, link: group.link }));
}

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".")) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

export default defineConfig({
  title: "Pacer Programmer",
  description: "A browser-based editor and simulator for the Nektar Pacer MIDI foot controller.",
  lang: "en",
  base: BASE,
  outDir: OUT,
  cleanUrls: true,
  rewrites: { "README.md": "index.md", ":folder/README.md": ":folder/index.md" },
  sitemap: { hostname: SITE + BASE },
  head: iconLinks(brand, BASE).map((attrs) => ["link", attrs]),
  // VitePress runs its own, older Vite, whose Plugin type differs from this repository's; the hooks
  // the plugin uses are the same in both.
  vite: { plugins: [brandDocsPlugin(brand, brandDir, resolve(import.meta.dirname, "theme/brand.css")) as never] },

  // `rewrites` renames the files but not the links to them, so `guide/README.md` in a page's text
  // would point at a page that isn't there. Point it at the folder's index instead.
  markdown: {
    // Heading anchors as GitHub makes them, which is what the pages' #links are written against.
    anchor: { slugify: githubSlug },
    config(md) {
      md.core.ruler.after("inline", "readme-links", (state) => {
        for (const token of state.tokens) {
          for (const child of token.children ?? []) {
            const href = child.type === "link_open" ? child.attrGet("href") : null;
            if (href && !/^[a-z]+:/i.test(href)) child.attrSet("href", readmeToIndex(href));
          }
        }
      });
    },
  },

  // One address for each page, whichever way it was reached.
  transformPageData(page) {
    const path = page.relativePath.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "");
    page.frontmatter.head ??= [];
    page.frontmatter.head.push(["link", { rel: "canonical", href: SITE + BASE + path }]);
  },

  // The Markdown itself goes out too, at the same paths as in the repository, so an AI can be
  // pointed at the page it should read (guide/working-with-ai.md does this).
  buildEnd() {
    for (const file of markdownFiles(DOCS)) {
      const target = join(OUT, relative(DOCS, file));
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(file, target);
    }
  },

  themeConfig: {
    sidebar: sidebarFrom(readFileSync(join(DOCS, "README.md"), "utf8")),
    outline: { level: [2, 3] },
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: REPOSITORY }],
    editLink: { pattern: `${REPOSITORY}/edit/main/docs/:path`, text: "Edit this page on GitHub" },
    // Credited in every build, like the app (src/brand/maker.ts); the kit adds its lockup ahead of
    // the site's name, as the app has it (theme/brand.css sizes it).
    footer: { message: `Pacer Programmer by <a href="${MAKER.url}">${MAKER.name}</a>` },
    logo: brand ? { light: "/brand/lockup-light.svg", dark: "/brand/lockup-dark.svg", alt: MAKER.name } : undefined,
  },
});
