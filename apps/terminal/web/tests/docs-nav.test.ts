/* The docs structure (docs/WEB_DOCS_INLINE_PLAN.md): each group is one page that shows all of
   its pages as parts, every page has content and vice versa, every anchor on a group page is its
   own, every command of the generated reference has a hand-written part, every old address lands
   on a live address (anchors included), and the search on a group page looks through that group
   and jumps to an anchor on it. */
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { DocSection, withPage } from "@/components/docs-primitives";
import { searchDocs } from "@/components/docs-search";
import { DOCS_CONTENT } from "@/content/docs";
import { COMMAND_DOCS, STALE_COMMAND_DOCS, UNDOCUMENTED_COMMANDS } from "@/content/docs/commands";
import commandsJson from "@/content/docs/commands.json";
import { COMMANDS, COMMAND_GROUPS, DOCS, DOCS_ENTRIES, DOCS_HOME_GROUP, DOCS_NAV, DOCS_ROUTES, docsGroupOf, isDocsAddress } from "@/lib/docs-nav";
import {
  ALL_DOCS_REDIRECTS,
  DOCS_GROUP_IDS,
  DOCS_PAGE_REDIRECT,
  DOCS_REDIRECTS,
  OLD_DOCS_ROUTES,
  docsRedirectOf,
} from "@/lib/docs-redirects";
import { docsSearchIndex, groupSearchIndex } from "@/lib/docs-search-index";

const PAGES = DOCS_NAV.flatMap((g) => g.pages.map((p) => ({ group: g, page: p })));

/** Every DocSection element in a tree (as the page renders it, after withPage). */
function sections(node: ReactNode, out: { title: string; page?: string }[] = []): { title: string; page?: string }[] {
  if (Array.isArray(node)) node.forEach((n) => sections(n, out));
  else if (isValidElement<{ title?: string; page?: string; children?: ReactNode }>(node)) {
    if (node.type === DocSection) out.push({ title: node.props.title!, page: node.props.page });
    sections(node.props.children, out);
  }
  return out;
}

describe("the docs structure", () => {
  it("has one route per group, and /docs shows Getting started", () => {
    expect(DOCS_ROUTES).toEqual(["/docs", ...DOCS_NAV.map((g) => `/docs/${g.id}`)]);
    expect(new Set(DOCS_ROUTES).size).toBe(DOCS_ROUTES.length);
    expect(DOCS_HOME_GROUP).toBe("getting-started");
    expect(docsGroupOf("/docs")?.id).toBe("getting-started");
    expect(docsGroupOf("/docs/commands")?.id).toBe("commands");
    expect(docsGroupOf("/docs/commands/model")).toBeUndefined(); // a page is no route of its own
  });

  it("lists the groups the plan asks for, in order", () => {
    expect(DOCS_NAV.map((g) => g.id)).toEqual([
      "getting-started",
      "terminal-guide",
      "commands",
      "assessment-guide",
      "reports",
      "troubleshooting",
      "guardrails",
    ]);
    expect(PAGES.length).toBeGreaterThan(40);
  });

  it("has content for every page, and a page for every content entry", () => {
    for (const g of DOCS_NAV) {
      const content = DOCS_CONTENT[g.id];
      expect(content, `content for ${g.id}`).toBeDefined();
      expect(g.pages.length, `${g.id} has pages`).toBeGreaterThan(0);
      for (const p of g.pages) {
        expect(p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(p.href).toBe(`/docs/${g.id}#${p.slug}`);
        expect(content[p.slug], `content for ${p.href}`).toBeDefined();
        expect(content[p.slug].lede.length).toBeGreaterThan(0);
      }
      for (const slug of Object.keys(content)) expect(g.pages.some((p) => p.slug === slug), `${g.id}/${slug} in DOCS_NAV`).toBe(true);
    }
    for (const id of Object.keys(DOCS_CONTENT)) expect(DOCS_NAV.some((g) => g.id === id), `group ${id}`).toBe(true);
  });

  it("scopes every section to its page, so its anchor is <page>-<section>", () => {
    for (const { group, page } of PAGES) {
      const found = sections(withPage(DOCS_CONTENT[group.id][page.slug].body, page.slug));
      expect(found.length, `${page.href} has sections`).toBeGreaterThan(0);
      for (const s of found) expect(s.page, `${page.href}: "${s.title}"`).toBe(page.slug);
    }
  });

  it("gives every heading on a group page its own anchor", () => {
    const index = docsSearchIndex();
    for (const g of DOCS_NAV) {
      const ids = index.filter((e) => e.group === g.id).flatMap((e) => [e.anchor, ...e.headings.map((h) => h.id)]);
      expect(ids.length).toBeGreaterThan(g.pages.length);
      expect(ids.filter((id, i) => ids.indexOf(id) !== i), `${g.id} repeats an anchor`).toEqual([]);
      for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
      // the frame's own ids stay apart from the content's
      expect(ids).not.toContain("docs-sidebar-nav");
    }
  });
});

describe("the generated command reference", () => {
  it("comes from commands.json and covers every command once", () => {
    expect(COMMAND_GROUPS).toBe(commandsJson.groups);
    expect(COMMANDS.length).toBe(commandsJson.count);
    expect(new Set(COMMANDS.map((c) => c.name)).size).toBe(COMMANDS.length);
  });

  it("has a hand-written part for every command, and no part for a command that is gone", () => {
    expect(UNDOCUMENTED_COMMANDS).toEqual([]);
    expect(STALE_COMMAND_DOCS).toEqual([]);
    expect(Object.keys(COMMAND_DOCS).sort()).toEqual(COMMANDS.map((c) => c.name).sort());
  });

  it("lists one part per command on the Commands page, in the reference's order", () => {
    const group = DOCS_NAV.find((g) => g.id === "commands")!;
    expect(group.pages.map((p) => p.slug)).toEqual(COMMANDS.map((c) => c.name));
    expect(group.pages.map((p) => p.title)).toEqual(COMMANDS.map((c) => `/${c.name}`));
    expect(Object.keys(DOCS_CONTENT.commands).sort()).toEqual(COMMANDS.map((c) => c.name).sort());
    for (const c of COMMANDS) {
      const doc = COMMAND_DOCS[c.name];
      expect(doc.syntax.startsWith(`/${c.name}`), `${c.name} syntax`).toBe(true);
      expect(doc.example.startsWith(`/${c.name}`), `${c.name} example`).toBe(true);
      expect(DOCS_CONTENT.commands[c.name].lede).toBe(c.description);
    }
  });
});

describe("the old addresses", () => {
  const live = new Set(DOCS_ROUTES);

  it("each page's own address (one page per address, before) lands on its part", () => {
    for (const { group, page } of PAGES) {
      expect(docsRedirectOf(`/docs/${group.id}/${page.slug}`), page.href).toBe(page.href);
      expect(isDocsAddress(page.href), page.href).toBe(true);
    }
  });

  it("the v2 addresses each still exist or land on a live address", () => {
    for (const old of OLD_DOCS_ROUTES) {
      const target = docsRedirectOf(old);
      if (live.has(old)) expect(target, `${old} exists and must not redirect`).toBeUndefined();
      else expect(target !== undefined && isDocsAddress(target), `${old} → ${target}`).toBe(true);
    }
  });

  it("redirect once, from an address that is no longer a page, and each only once", () => {
    expect(new Set(DOCS_REDIRECTS.map((r) => r.source)).size).toBe(DOCS_REDIRECTS.length);
    for (const r of DOCS_REDIRECTS) {
      expect(OLD_DOCS_ROUTES).toContain(r.source);
      expect(live.has(r.source), `${r.source} is a live page`).toBe(false);
      expect(isDocsAddress(r.destination), `${r.destination} is live`).toBe(true);
      expect(docsRedirectOf(r.destination.split("#")[0]), `${r.destination} redirects again`).toBeUndefined();
    }
  });

  it("send a page's address by one rule that knows every group, tried last", () => {
    expect(DOCS_GROUP_IDS).toEqual(DOCS_NAV.map((g) => g.id));
    expect(ALL_DOCS_REDIRECTS.at(-1)).toBe(DOCS_PAGE_REDIRECT);
    expect(ALL_DOCS_REDIRECTS.slice(0, -1)).toEqual(DOCS_REDIRECTS);
    expect(DOCS_PAGE_REDIRECT.destination).toBe("/docs/:group#:page");
    for (const route of DOCS_ROUTES) expect(docsRedirectOf(route), route).toBeUndefined();
    expect(docsRedirectOf("/docs/no-such-group/page")).toBeUndefined();
    expect(docsRedirectOf("/docs/commands/model/extra")).toBeUndefined();
  });

  it("sends the dashboard's old Configuration link to a live page", () => {
    expect(docsRedirectOf("/docs/getting-started/configuration")).toBe("/docs/getting-started#installation");
    // the removed AI-models group is no longer a known docs group
    expect(docsRedirectOf("/docs/ai-models/configuration")).toBeUndefined();
  });
});

describe("the docs search", () => {
  const index = docsSearchIndex();

  it("indexes every page with its headings, anchored on its group page", () => {
    expect(index.map((e) => e.href)).toEqual(PAGES.map(({ page }) => page.href));
    for (const e of index) {
      expect(e.headings.length, `${e.href} headings`).toBeGreaterThan(0);
      for (const h of e.headings) expect(h.id.startsWith(`${e.anchor}-`), h.id).toBe(true);
    }
  });

  it("looks through the group shown only", () => {
    for (const g of DOCS_NAV) {
      const own = groupSearchIndex(g.id);
      expect(own.map((e) => e.anchor)).toEqual(g.pages.map((p) => p.slug));
    }
    // /model is a command: the Guardrails page finds no command part
    expect(searchDocs(groupSearchIndex("guardrails"), "/model").map((h) => h.entry.group)).not.toContain("commands");
  });

  it("finds a command by its name and by an alias, on the Commands page", () => {
    const commands = groupSearchIndex("commands");
    expect(searchDocs(commands, "/web")[0].anchor).toBe("web");
    expect(searchDocs(commands, "web")[0].anchor).toBe("web");
    expect(searchDocs(commands, "/dashboard").map((h) => h.anchor)).toContain("web");
  });

  it("finds a section heading and jumps to its anchor", () => {
    const hit = searchDocs(groupSearchIndex("assessment-guide"), "double check").find((h) => h.entry.anchor === "approval-gates");
    expect(hit?.anchor).toBe("approval-gates-high-risk-the-double-check");
    expect(searchDocs(index, "")).toEqual([]);
    expect(searchDocs(index, "zzz-no-such-thing")).toEqual([]);
  });
});

describe("the DOCS link map", () => {
  it("names only live addresses", () => {
    for (const [key, href] of Object.entries(DOCS)) expect(isDocsAddress(href), `DOCS.${key}: ${href}`).toBe(true);
  });

  it("has no Configuration entry (the rail's Settings item is gone)", () => {
    expect(Object.keys(DOCS)).not.toContain("configuration");
  });

  it("lists every group and page for the dashboard's docs search", () => {
    expect(DOCS_ENTRIES.filter((e) => e.isGroup).map((e) => e.href)).toEqual(DOCS_ROUTES.slice(1));
    expect(DOCS_ENTRIES.filter((e) => !e.isGroup).map((e) => e.href)).toEqual(PAGES.map(({ page }) => page.href));
    for (const e of DOCS_ENTRIES) expect(isDocsAddress(e.href), e.href).toBe(true);
  });
});
