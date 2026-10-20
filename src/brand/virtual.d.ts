// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

/** The build's brand kit (see vitePlugin.ts): null in a neutral build, which is the default. */
declare module "virtual:brand" {
  export const brand: { logoUrl: string } | null;
}
