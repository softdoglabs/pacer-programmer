// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { brandPlugin } from "./src/brand/vitePlugin";

export default defineConfig({
  // brandPlugin: neutral unless PACER_BRAND_DIR names a brand kit (src/brand/vitePlugin.ts).
  plugins: [react(), tailwindcss(), brandPlugin()],
  // Lets the factory-defaults SysEx dump be imported as an asset (see src/pacer/factoryDefaults.ts).
  assetsInclude: ["**/*.syx"],
  test: {
    setupFiles: ["src/test/setup.ts"],
    // Node 25+ has a localStorage of its own, which warns when read without a storage file. Tests
    // outside jsdom should find none, as before; the jsdom ones get jsdom's.
    poolOptions: { forks: { execArgv: ["--no-experimental-webstorage"] } },
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
