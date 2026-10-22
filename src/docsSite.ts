// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/**
 * Where the docs are published (docs/.vitepress/config.ts builds them for this address, and the
 * docs Worker serves them there). A path of softdoglabs.com rather than a subdomain of its own, so
 * the docs count toward the main site in search. The app links here, and the AI tutorial's prompt
 * points an AI at the Markdown published beside each page.
 */
export const DOCS_SITE = "https://softdoglabs.com";
export const DOCS_BASE = "/docs/pacer-programmer/";
export const DOCS_URL = DOCS_SITE + DOCS_BASE;

/** Where the app itself is, which every docs page links to from its top bar. */
export const APP_URL = "https://pacer-programmer.softdoglabs.com/";

/** The source, which the app's header and the docs (top bar, footer, License page) link to. */
export const REPO_URL = "https://github.com/softdoglabs/pacer-programmer";
