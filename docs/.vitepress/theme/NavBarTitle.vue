<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/*
 * VitePress's nav title (VPNavBarTitle), replaced (config.ts aliases it here) because its one link
 * wraps both the logo and the site's name. Here they're two links: the brand kit's lockup goes to
 * the maker's site, as it does in the app, and the name to the docs' front page. A neutral build has
 * no logo, so only the name.
 *
 * The maker's site shares the docs' origin, and VitePress's router takes any same-origin link to be
 * one of its own pages unless the link has a target. Hence target="_self": an ordinary page load.
 */

import { useData, withBase } from "vitepress";
import { VPImage, useSidebar } from "vitepress/theme";
import { MAKER } from "../../../src/brand/maker";

const { site, theme } = useData();
const { hasSidebar } = useSidebar();
</script>

<template>
  <div class="VPNavBarTitle" :class="{ 'has-sidebar': hasSidebar }">
    <div class="title">
      <a v-if="theme.logo" class="lockup" :href="MAKER.url" target="_self">
        <VPImage class="logo" :image="theme.logo" />
      </a>
      <a class="name" :href="withBase('/')">{{ site.title }}</a>
    </div>
  </div>
</template>

<!-- As VitePress's own, which this replaces, plus the line between the lockup and the name. -->
<style scoped>
.title {
  display: flex;
  align-items: center;
  border-bottom: 1px solid transparent;
  width: 100%;
  height: var(--vp-nav-height);
  font-size: 16px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.lockup,
.name {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  white-space: nowrap;
  transition: opacity 0.25s;
}

.lockup:hover,
.name:hover {
  opacity: 0.75;
}

.lockup + .name {
  margin-left: 12px;
  padding-left: 12px;
  border-left: 1px solid var(--vp-c-divider);
  align-self: stretch;
  margin-block: 16px;
}

@media (min-width: 960px) {
  .title {
    flex-shrink: 0;
  }

  .VPNavBarTitle.has-sidebar .title {
    border-bottom-color: var(--vp-c-divider);
  }
}

:deep(.logo) {
  height: var(--vp-nav-logo-height);
}
</style>
