// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { brand } from "virtual:brand";

/**
 * Who made this build, beside the app's name: "by Soft Dog Labs" in a branded build, nothing in a
 * neutral one (see src/brand/vitePlugin.ts). It opens in a tab of its own, since leaving would
 * drop unsaved edits, and it keeps the referrer so the visit is seen to come from here.
 */
export function BrandCredit() {
  if (!brand) return null;
  return (
    <a
      href={brand.url}
      target="_blank"
      rel="noopener"
      className="flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground ring-focus outline-none hover:text-foreground"
    >
      {brand.logoUrl && <img src={brand.logoUrl} alt="" className="h-4 w-auto" />}
      by {brand.name}
    </a>
  );
}
