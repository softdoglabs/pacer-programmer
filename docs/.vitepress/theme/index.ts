// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/*
 * VitePress's own theme, with the docs' own styles (site.css), plus the brand kit's look when the
 * build has one (`virtual:brand-docs.css` is empty otherwise; see src/brand/vitePlugin.ts).
 */

import { useData } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { h, watchEffect } from "vue";
import OpenAppPhone from "./OpenAppPhone.vue";
import "./site.css";
import "virtual:brand-docs.css";

export default {
  extends: DefaultTheme,
  // A phone's way to the app, above each page (OpenAppPhone.vue).
  Layout: () => h(DefaultTheme.Layout, null, { "doc-before": () => h(OpenAppPhone) }),
  setup() {
    // The kit's colours follow the OS unless told otherwise, and the docs have a light/dark switch
    // of their own, so tell the kit which one the switch chose. data-theme on <html> is how the kit
    // forces a whole page (its sdl-theme-* classes are for sections, and lose to its dark-OS rule on
    // the root). Harmless without the kit.
    const { isDark } = useData();
    watchEffect(() => {
      if (typeof document !== "undefined") document.documentElement.dataset.theme = isDark.value ? "dark" : "light";
    });
  },
};
