import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The docs are read on GitHub, which renders relative links and heading anchors but reports
 * neither when they're broken: a link to a renamed page or heading just goes nowhere. Every
 * relative link and image in docs/ has to name a file that exists (a page, never a folder, which
 * GitHub shows as a file listing), and every #anchor a heading in it, slugged the way GitHub
 * slugs them.
 */

const DOCS = "docs";

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return path.endsWith(".md") ? [path] : [];
  });
}

/** The page's text outside fenced code blocks, where a `](` or a `#` means nothing. */
function prose(text: string): string {
  return text.replace(/^```[\s\S]*?^```/gm, "");
}

/** GitHub's heading anchors: lowercased, punctuation dropped, each space a hyphen, repeats numbered. */
function anchors(file: string): Set<string> {
  const seen = new Map<string, number>();
  const found = new Set<string>();
  for (const [, heading] of prose(readFileSync(file, "utf8")).matchAll(/^#{1,6} (.+)$/gm)) {
    const text = heading!.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
    const slug = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .replace(/ /g, "-");
    const n = seen.get(slug) ?? 0;
    seen.set(slug, n + 1);
    found.add(n === 0 ? slug : `${slug}-${n}`);
  }
  return found;
}

/** Where a link leads: a directory means its README, as GitHub shows it. */
function resolve(from: string, target: string): string {
  const path = normalize(join(dirname(from), target));
  return target.endsWith("/") || (existsSync(path) && statSync(path).isDirectory()) ? join(path, "README.md") : path;
}

function links(file: string): { target: string; line: number }[] {
  const text = prose(readFileSync(file, "utf8"));
  return [...text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)]
    .map((m) => ({ target: m[1]!, line: text.slice(0, m.index).split("\n").length }))
    .filter(({ target }) => !/^[a-z]+:/i.test(target));
}

describe("links in the docs", () => {
  // The repository's own README links into the docs too, and is what GitHub shows first.
  const files = [...markdownFiles(DOCS), "README.md"];

  it("has pages to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("only link to files and headings that exist", () => {
    const broken: string[] = [];
    for (const file of files) {
      for (const { target, line } of links(file)) {
        const [path, anchor] = target.split("#") as [string, string | undefined];
        // GitHub shows a folder as a file listing above its README, so link the page itself.
        if (path.endsWith("/")) {
          broken.push(`${file}:${line} → ${target} (link the .md file, not the folder)`);
          continue;
        }
        const to = path === "" ? file : resolve(file, path);
        if (!existsSync(to)) {
          broken.push(`${file}:${line} → ${target} (no such file)`);
        } else if (anchor !== undefined && to.endsWith(".md") && !anchors(to).has(anchor)) {
          broken.push(`${file}:${line} → ${target} (no such heading)`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
