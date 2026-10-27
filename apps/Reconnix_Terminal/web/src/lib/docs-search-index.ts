import { isValidElement, type ReactNode } from "react";

import { DocSection, sectionId } from "@/components/docs-primitives";
import { DOCS_CONTENT } from "@/content/docs";
import { COMMANDS, DOCS_NAV } from "@/lib/docs-nav";

/**
 * What the docs search looks through: every page's title and description, its section
 * headings (so "double check" finds the Approval gates part's section) and, for a command, its
 * aliases (so "/agent" finds /assess). A group's page shows all of its pages, so the search on it
 * looks through that group only (groupSearchIndex) and jumps to an anchor on the same page: the
 * page's `#<slug>` or a section's `#<slug>-<section>` (the ids the group page renders). Built
 * once on the server by walking the content's React elements for DocSection titles; no page is
 * rendered to do it.
 */
export type DocsSearchEntry = {
  /** the page's anchor on its group's page */
  anchor: string;
  /** the page's address, `/docs/<group>#<anchor>` */
  href: string;
  title: string;
  /** the DOCS_NAV group id */
  group: string;
  description: string;
  headings: { id: string; title: string }[];
  keywords: string[];
};

function sectionTitles(node: ReactNode, out: string[]): void {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return;
  if (Array.isArray(node)) {
    for (const child of node) sectionTitles(child, out);
    return;
  }
  if (isValidElement<{ title?: unknown; children?: ReactNode }>(node)) {
    if (node.type === DocSection && typeof node.props.title === "string") out.push(node.props.title);
    sectionTitles(node.props.children, out);
  }
}

let cached: DocsSearchEntry[] | undefined;

/** Every page of every group, in DOCS_NAV order. */
export function docsSearchIndex(): DocsSearchEntry[] {
  if (cached) return cached;
  const byName = new Map(COMMANDS.map((c) => [c.name, c]));
  cached = DOCS_NAV.flatMap((g) =>
    g.pages.map((p) => {
      const titles: string[] = [];
      sectionTitles(DOCS_CONTENT[g.id]?.[p.slug]?.body, titles);
      const command = g.id === "commands" ? byName.get(p.slug) : undefined;
      return {
        anchor: p.slug,
        href: p.href,
        title: p.title,
        group: g.id,
        description: p.description,
        headings: titles.map((t) => ({ id: sectionId(p.slug, t), title: t })),
        keywords: command ? command.aliases.map((a) => `/${a}`) : [],
      };
    })
  );
  return cached;
}

/** The pages of one group: what the search on that group's page looks through. */
export function groupSearchIndex(groupId: string): DocsSearchEntry[] {
  return docsSearchIndex().filter((e) => e.group === groupId);
}
