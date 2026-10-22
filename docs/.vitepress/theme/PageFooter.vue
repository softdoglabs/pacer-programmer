<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/*
 * The credit, the license and the source, under every page. VitePress's own footer
 * (themeConfig.footer) is hidden on any page with a sidebar, which here is every page, so its
 * credit never showed; this sits at the end of the page's own column instead (index.ts,
 * `doc-after`).
 *
 * The maker's site shares the docs' origin, hence target="_self" (see NavBarTitle.vue). The
 * License link is one of the docs' own pages, so it's left to the router.
 */

import { withBase } from "vitepress";
import { MAKER } from "../../../src/brand/maker";
import { REPO_URL } from "../../../src/docsSite";
</script>

<template>
  <footer class="page-footer">
    Pacer Programmer by <a :href="MAKER.url" target="_self">{{ MAKER.name }}</a> ·
    <a :href="withBase('/license')">License</a> ·
    <a :href="REPO_URL">Source on GitHub</a>
  </footer>
</template>

<style scoped>
.page-footer {
  margin-top: 48px;
  border-top: 1px solid var(--vp-c-divider);
  padding-top: 16px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.page-footer a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.page-footer a:hover {
  color: var(--vp-c-text-1);
}
</style>
