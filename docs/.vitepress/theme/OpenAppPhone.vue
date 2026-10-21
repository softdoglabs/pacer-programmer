<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/*
 * "Open the programmer" at the top of every page, on phones only. Wider screens have it in the top
 * bar (config.ts, `nav`); a phone's top bar folds that into a menu, where someone arriving from a
 * search wouldn't look for it.
 */

import { APP_URL } from "../../../src/docsSite";
</script>

<template>
  <a class="open-app" :href="APP_URL" target="_blank" rel="noopener">Open the programmer ↗</a>
</template>

<style scoped>
.open-app {
  display: block;
  margin-bottom: 24px;
  border-radius: 20px;
  padding: 0 20px;
  line-height: 40px;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  background-color: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
}

.open-app:hover {
  background-color: var(--vp-button-brand-hover-bg);
  color: var(--vp-button-brand-hover-text);
}

/* Where the top bar shows its own (VitePress shows nav links from 768px). */
@media (min-width: 768px) {
  .open-app {
    display: none;
  }
}
</style>
