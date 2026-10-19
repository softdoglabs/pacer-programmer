// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Every source file says which licence it's under and whose it is, so a file copied out of the
 * repository still carries both. A new file is the one that gets forgotten, hence the test.
 */

const HEADER =
  /SPDX-License-Identifier: GPL-3\.0-only(?: \*\/)?\n(?:\/\/|\/\*) Copyright \(C\) \d{4} Soft Dog Labs, LLC/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs|css)$/.test(name) ? [path] : [];
  });
}

describe("licence headers", () => {
  it("are on every source file and script", () => {
    const files = [
      ...sourceFiles("src"),
      ...sourceFiles("scripts"),
      "eslint.config.js",
      "vite.config.ts",
      "docs/.vitepress/config.ts",
    ];
    const missing = files.filter((path) => !HEADER.test(readFileSync(path, "utf8").slice(0, 400)));
    expect(missing).toEqual([]);
  });
});
