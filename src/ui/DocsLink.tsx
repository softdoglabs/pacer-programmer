// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { BookOpen } from "lucide-react";
import { Titled } from "@/components/ui/titled";
import { DOCS_URL } from "@/docsSite";

/*
 * The docs are published on softdoglabs.com (src/docsSite.ts), and the app links there rather than
 * carrying a copy of its own: one canonical page per topic, nothing to keep in step, and nothing a
 * search engine sees twice.
 */

/** A link to the docs, opening beside the app so you can follow along while you work. */
export function DocsLink() {
  return (
    <Titled title="How to use Pacer Programmer: guides, tutorials and the reference">
      <a
        href={DOCS_URL}
        target="_blank"
        rel="noopener"
        className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground ring-focus outline-none hover:bg-accent hover:text-foreground"
      >
        <BookOpen aria-hidden className="size-4" />
        Docs
      </a>
    </Titled>
  );
}
