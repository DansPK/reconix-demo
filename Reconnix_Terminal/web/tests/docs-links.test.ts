/* Every docs address the app names is live: the dashboard's components link through the DOCS map
   (lib/docs-nav.ts), and any `/docs/…` string under src/components or src/app is checked against
   the docs' routes and, with an anchor, against the anchors that route's page renders (its pages'
   and their sections'), so the docs can move again by changing docs-nav.ts alone. The docs
   content itself names no address at all: it reads in place (docs/WEB_DOCS_INLINE_PLAN.md). */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DOCS, DOCS_ROUTES, docsGroupOf } from "@/lib/docs-nav";
import { docsSearchIndex } from "@/lib/docs-search-index";

const SRC = path.join(__dirname, "..", "src");
const SCANNED = ["components", "app"];
const DOCS_LINK = /["'`](\/docs(?:\/[a-z0-9-]+)*)(?:#([a-z0-9-]+))?["'`]/g;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (/\.tsx?$/.test(name)) yield full;
  }
}

/** Every `/docs/…` literal in the scanned folders, with where it is (relative to src/). */
function docsLiterals(): { file: string; href: string; path: string; anchor?: string }[] {
  const out: { file: string; href: string; path: string; anchor?: string }[] = [];
  for (const dir of SCANNED) {
    for (const file of files(path.join(SRC, dir))) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(DOCS_LINK)) {
        out.push({ file: path.relative(SRC, file), href: m[2] ? `${m[1]}#${m[2]}` : m[1], path: m[1], anchor: m[2] });
      }
    }
  }
  return out;
}

/** Whether `href` is a docs route, and its anchor (if any) one its page renders. */
function live(href: string): boolean {
  const [route, anchor] = href.split("#", 2);
  if (!DOCS_ROUTES.includes(route)) return false;
  if (anchor === undefined) return true;
  const group = docsGroupOf(route)!.id;
  return docsSearchIndex()
    .filter((e) => e.group === group)
    .some((e) => e.anchor === anchor || e.headings.some((h) => h.id === anchor));
}

describe("the docs links in the components", () => {
  it("each name a live docs address", () => {
    const found = docsLiterals();
    expect(found.length).toBeGreaterThan(0);
    for (const { file, href } of found) expect(live(href), `${file} links to ${href}`).toBe(true);
  });

  it("the dashboard's components go through the DOCS map", () => {
    const literal = docsLiterals().filter(({ file }) => file.startsWith("components/dashboard/"));
    expect(literal.map(({ file, href }) => `${file}: ${href}`)).toEqual([]);
  });

  it("the DOCS map names only live addresses", () => {
    for (const [key, href] of Object.entries(DOCS)) expect(live(href), `DOCS.${key}`).toBe(true);
  });
});

describe("the docs content", () => {
  it("names no address and holds no link: another part is named in words (DocRef)", () => {
    const dir = path.join(SRC, "content", "docs");
    const linked: string[] = [];
    // the pages (.tsx); index.ts and types.ts only describe them
    for (const file of [...files(dir)].filter((f) => f.endsWith(".tsx"))) {
      const text = readFileSync(file, "utf8");
      if (/\bhref=|<Link\b|<a\s|DocLink|["'`]\/docs\b/.test(text)) linked.push(path.relative(SRC, file));
    }
    expect(linked).toEqual([]);
  });
});
