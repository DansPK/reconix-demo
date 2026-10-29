"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { DOCS_NAV, type DocGroup } from "@/lib/docs-nav";
import { cn } from "@/lib/utils";

/**
 * Docs sidebar from DOCS_NAV: one collapsible section per group (single-page groups are a
 * plain link), the current page highlighted in teal and its group expanded. Below lg it
 * collapses behind a "Docs menu" button and closes again when a page is chosen.
 */
export function DocsSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // groups the reader toggled by hand; the current page's group is always open
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  // close the mobile menu when the route changes (set during render: React's "adjust state on prop change")
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setMobileOpen(false);
  }

  const isOpen = (g: DocGroup) => toggled[g.id] ?? (pathname === g.href || g.pages.some((p) => p.href === pathname));

  return (
    <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto" data-lenis-prevent>
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg border border-border bg-card/70 px-4 py-3 font-mono text-xs uppercase tracking-[0.16em] text-foreground lg:hidden"
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
        className={cn("mt-3 rounded-xl border border-border bg-card/70 p-3 lg:mt-0 lg:block lg:border-0 lg:bg-transparent lg:p-0", !mobileOpen && "hidden")}
      >
        <p className="mb-3 hidden px-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground lg:block">
          Documentation
        </p>
        <ul className="space-y-1">
          {DOCS_NAV.map((g) => {
            const Icon = g.icon;
            const groupActive = pathname === g.href;
            if (g.pages.length === 0) {
              return (
                <li key={g.id}>
                  <Link
                    href={g.href}
                    aria-current={groupActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                      groupActive ? "bg-primary/10 text-primary" : "text-foreground/85 hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {g.title}
                  </Link>
                </li>
              );
            }
            const open = isOpen(g);
            return (
              <li key={g.id}>
                <div className="flex items-center">
                  <Link
                    href={g.href}
                    aria-current={groupActive ? "page" : undefined}
                    className={cn(
                      "flex flex-1 items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                      groupActive ? "bg-primary/10 text-primary" : "text-foreground/85 hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {g.title}
                  </Link>
                  <button
                    type="button"
                    aria-label={`${open ? "Collapse" : "Expand"} ${g.title}`}
                    aria-expanded={open}
                    aria-controls={`docs-group-${g.id}`}
                    onClick={() => setToggled((t) => ({ ...t, [g.id]: !open }))}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
                  </button>
                </div>
                <ul id={`docs-group-${g.id}`} hidden={!open} className="my-1 ml-[1.05rem] space-y-0.5 border-l border-border pl-3">
                  {g.pages.map((p) => {
                    const active = pathname === p.href;
                    return (
                      <li key={p.href}>
                        <Link
                          href={p.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "-ml-[13px] block border-l py-1.5 pl-3 text-sm transition-colors",
                            active
                              ? "border-primary font-medium text-primary"
                              : "border-transparent text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
                          )}
                        >
                          {p.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
