#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/*
 * Checks the built docs site (`pnpm docs:build`) the way a reader would find it: every link and
 * image on every page must lead to something the site serves, and every #anchor to an id on that
 * page. src/test/docsLinks.test.ts checks the Markdown as GitHub shows it; this checks what
 * VitePress made of it, which is where a renamed page or a link it rewrote goes wrong.
 *
 * Paths resolve the way the Worker serves them (wrangler.docs.jsonc, auto-trailing-slash): `/a/b`
 * is a/b.html (or a redirect to `/a/b/` when that's a folder), `/a/` is a/index.html, and anything
 * else is the file itself.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("../build/docs-site", import.meta.url));
const BASE = "/docs/pacer-programmer/";

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith(".html") ? [path] : [];
  });
}

/** The file a URL path is served from, or null. */
function served(path) {
  const file = join(SITE, decodeURIComponent(path));
  for (const candidate of path.endsWith("/")
    ? [join(file, "index.html")]
    : [file, `${file}.html`, join(file, "index.html")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const ids = new Map();
function idsOf(file) {
  if (!ids.has(file))
    ids.set(file, new Set([...readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return ids.get(file);
}

if (!existsSync(join(SITE, BASE))) {
  console.error(`No built site at ${join(SITE, BASE)}: run pnpm docs:build first.`);
  process.exit(1);
}

const problems = [];
let checked = 0;
for (const page of htmlFiles(join(SITE, BASE))) {
  const pagePath =
    "/" +
    relative(SITE, page)
      .replace(/(^|\/)index\.html$/, "$1")
      .replace(/\.html$/, "");
  const html = readFileSync(page, "utf8");
  for (const [, attr, url] of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
    if (/^(?:[a-z]+:|\/\/)/i.test(url) || url === "") continue;
    const resolved = new URL(url.replaceAll("&amp;", "&"), `https://site${pagePath}`);
    checked++;
    if (!resolved.pathname.startsWith(BASE)) {
      problems.push(`${pagePath}: ${attr} ${url} leaves ${BASE}`);
      continue;
    }
    const file = served(resolved.pathname);
    if (!file) problems.push(`${pagePath}: ${attr} ${url} -> ${resolved.pathname} isn't served`);
    else if (resolved.hash && file.endsWith(".html") && !idsOf(file).has(decodeURIComponent(resolved.hash.slice(1))))
      problems.push(`${pagePath}: ${url} -> no ${resolved.hash} on ${resolved.pathname}`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} broken of ${checked} links checked.`);
  process.exit(1);
}
console.log(`All ${checked} links and images on the built docs site resolve.`);
