// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync } from "node:fs";
import { vi } from "vitest";

/*
 * Vitest replaces asset imports with their file path instead of inlining them, so give the
 * factory-defaults module the same data URL a real Vite build produces.
 */
vi.mock("../../fixtures/factory-presets.syx?inline", () => ({
  default: `data:application/octet-stream;base64,${readFileSync("fixtures/factory-presets.syx").toString("base64")}`,
}));
