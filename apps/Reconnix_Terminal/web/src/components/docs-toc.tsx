"use client";

import { useDocsHeadings } from "@/components/docs-headings";
import { cn } from "@/lib/utils";

/**
 * "On this page" (xl only): the group page's pages (its parts) and, under the part being read,
 * its sections, with the heading being read marked. Every entry is a same-page hash link: the
 * browser scrolls the content area (or the window) to it, smoothly where motion is allowed
 * (dashboard.css), honouring the heading's scroll-mt. The list scrolls inside its sticky column
 * when a group has many pages (Commands).
 */
export function DocsToc() {
  const { headings, active, activePart } = useDocsHeadings();

  if (headings.length < 2) return <div className="hidden xl:block" />;
  const parts = headings.filter((h) => h.level === 2);

  return (
    <nav
      aria-label="On this page"
      className="docs-toc hidden xl:sticky xl:top-4 xl:block xl:max-h-[calc(100dvh-9rem)] xl:self-start xl:overflow-y-auto"
    >
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">On this page</p>
      <ul className="space-y-1 border-l border-border">
        {parts.map((p) => {
          const open = p.id === activePart;
          const sections = open ? headings.filter((h) => h.level === 3 && h.part === p.id) : [];
          return (
            <li key={p.id}>
              <a
                href={`#${p.id}`}
                aria-current={open ? "location" : undefined}
                className={cn(
                  "-ml-px block border-l py-1 pl-3 text-[13px] leading-snug transition-colors",
                  open ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {p.title}
              </a>
              {sections.length > 0 && (
                <ul className="mb-1">
                  {sections.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className={cn(
                          "block py-1 pl-6 text-[12px] leading-snug transition-colors", // 24 px tall: a full touch target
                          active === s.id ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
