// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { brand } from "virtual:brand";
import { MAKER } from "@/brand/maker";

/**
 * Their site, in a tab of its own (leaving would drop unsaved edits), keeping the referrer so the
 * visit is seen to come from here: noopener, not noreferrer.
 */
const makerLink = { href: MAKER.url, target: "_blank", rel: "noopener" } as const;

/**
 * The app's name and who made it, in every build (maker.ts). Neutral: "Pacer Programmer by Soft Dog
 * Labs", the credit linking to their site. Branded: the kit's lockup in its place, ahead of the name
 * as a maker's mark goes (src/brand/vitePlugin.ts).
 */
export function AppTitle() {
  const title = <h1 className="text-base font-semibold">Pacer Programmer</h1>;
  if (!brand)
    return (
      <>
        {title}
        <a
          {...makerLink}
          className="rounded-sm text-xs text-muted-foreground ring-focus outline-none hover:text-foreground"
        >
          by {MAKER.name}
        </a>
      </>
    );
  return (
    <>
      <a {...makerLink} className="flex rounded-sm ring-focus outline-none">
        {/* The lockup's clear space, 40 units of its 300 high on each side, overlaps what's around it. */}
        <img src={brand.lockupUrl} alt={MAKER.name} className="-m-[calc(2.5rem*40/300)] h-10 w-auto" />
      </a>
      <span aria-hidden className="w-px self-stretch bg-border" />
      {title}
    </>
  );
}
