import { BookOpen } from "lucide-react";
import { Titled } from "@/components/ui/titled";

/*
 * The docs live in the repository, rendered by GitHub, and the app links there rather than carrying
 * a copy of its own: one canonical page per topic, nothing to keep in step, and nothing a search
 * engine sees twice. The same address is what the AI tutorial's prompt points an AI at.
 */

/** Where the repository lives. Every docs address is built from this, so a move is one edit. */
export const REPOSITORY_URL = "https://github.com/mvachhar/pacer-programmer";

/** The docs' front page, as GitHub renders it. */
export const DOCS_URL = `${REPOSITORY_URL}/blob/main/docs/README.md`;

/** A link to the docs, opening beside the app so you can follow along while you work. */
export function DocsLink() {
  return (
    <Titled title="How to use Pacer Programmer: guides, tutorials and the reference, on GitHub">
      <a
        href={DOCS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground ring-focus outline-none hover:bg-accent hover:text-foreground"
      >
        <BookOpen aria-hidden className="size-4" />
        Docs
      </a>
    </Titled>
  );
}
