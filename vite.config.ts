// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Lets the factory-defaults SysEx dump be imported as an asset (see src/pacer/factoryDefaults.ts).
  assetsInclude: ["**/*.syx"],
  test: {
    setupFiles: ["src/test/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
