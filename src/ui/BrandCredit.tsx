// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { brand } from "virtual:brand";
import { MAKER } from "@/brand/maker";

/**
 * Who made Pacer Programmer, beside its name: "by Soft Dog Labs", linking to their site, in every
 * build. A branded build adds the logo (src/brand/vitePlugin.ts). It opens in a tab of its own,
 * since leaving would drop unsaved edits, and it keeps the referrer so the visit is seen to come
 * from here.
 */
export function BrandCredit() {
  return (
    <a
      href={MAKER.url}
      target="_blank"
      rel="noopener"
      className="flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground ring-focus outline-none hover:text-foreground"
    >
      {brand && <img src={brand.logoUrl} alt="" className="h-5 w-auto" />}
      by {MAKER.name}
    </a>
  );
}
