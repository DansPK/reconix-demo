"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useDocsHeadings } from "@/components/docs-headings";
import { DocsSearch } from "@/components/docs-search";
import { DOCS_NAV } from "@/lib/docs-nav";
import type { DocsSearchEntry } from "@/lib/docs-search-index";
import { cn } from "@/lib/utils";

/**
 * Docs sidebar: the search box (this group only), then the groups. Choosing a group shows its
 * page (every page of the group, in order); under the group shown, below xl (where "On this
 * page" is hidden), its pages are anchors on this page, the one being read marked. Sticky on
 * desktop; below lg the list folds behind a "Docs menu" button and closes again after a choice
 * (the search stays visible at every size).
 */
export function DocsSidebar({ groupId, index }: { groupId: string; index: DocsSearchEntry[] }) {
  const pathname = usePathname();
  const { activePart } = useDocsHeadings();
  const [mobileOpen, setMobileOpen] = useState(false);
  // close the mobile menu when the route changes (set during render: React's "adjust state on prop change")
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setMobileOpen(false);
  }

  return (
    <aside className="docs-sidebar lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100dvh-9rem)] lg:flex-col lg:self-start">
      <DocsSearch index={index} />

      <button
        type="button"
        className="mt-3 flex w-full items-center justify-between rounded-lg border border-border bg-card/70 px-4 py-3 font-mono text-xs uppercase tracking-[0.16em] text-foreground lg:hidden"
        aria-expanded={mobileOpen}
        aria-controls="docs-sidebar-nav"
        onClick={() => setMobileOpen((o) => !o)}
      >
        Docs menu
        {mobileOpen ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
      </button>

      <nav
        id="docs-sidebar-nav"
        aria-label="Documentation"
        className={cn(
          "mt-3 rounded-xl border border-border bg-card/70 p-3 lg:mt-4 lg:block lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:border-0 lg:bg-transparent lg:p-0",
          !mobileOpen && "hidden"
        )}
      >
        <p className="mb-3 hidden px-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground lg:block">
          Documentation
        </p>
        <ul className="space-y-1" data-docs-groups="">
          {DOCS_NAV.map((g) => {
            const Icon = g.icon;
            const shown = g.id === groupId;
            return (
              <li key={g.id} data-docs-group={g.id}>
                <Link
                  href={g.href}
                  aria-current={shown ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                    shown ? "bg-primary/10 text-primary" : "text-foreground/85 hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {g.title}
                </Link>
                {shown && (
                  // xl: "On this page" lists the same pages (and their sections) beside the text
                  <ul aria-label={`${g.title} pages`} className="my-1 ml-[1.05rem] space-y-0.5 border-l border-border pl-3 xl:hidden">
                    {g.pages.map((p) => {
                      const reading = p.slug === activePart;
                      return (
                        <li key={p.slug}>
                          <a
                            href={`#${p.slug}`}
                            onClick={() => setMobileOpen(false)}
                            aria-current={reading ? "location" : undefined}
                            className={cn(
                              "-ml-[13px] block border-l py-1.5 pl-3 text-sm transition-colors",
                              reading
                                ? "border-primary font-medium text-primary"
                                : "border-transparent text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
                            )}
                          >
                            {p.title}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
