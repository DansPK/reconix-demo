"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Heading = { id: string; title: string };

/**
 * "On this page" (xl only): lists the page's DocSection headings (`h2[data-toc]` inside
 * `[data-docs-content]`) and highlights the one being read. The links are same-page hash
 * links, so smooth-scroll.tsx scrolls to them with Lenis (honouring the heading's scroll-mt).
 */
export function DocsToc() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-docs-content] h2[data-toc]")];
    // reading the DOM after render is the point of this effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeadings(els.map((el) => ({ id: el.id, title: el.textContent ?? "" })));
    setActive(els[0]?.id ?? null); // until the observer reports, the first section is "current"
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-90px 0px -65% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);

  if (headings.length < 2) return <div className="hidden xl:block" />;

  return (
    <nav aria-label="On this page" className="hidden xl:sticky xl:top-24 xl:block xl:self-start">
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">On this page</p>
      <ul className="space-y-1 border-l border-border">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={cn(
                "-ml-px block border-l py-1 pl-3 text-[13px] leading-snug transition-colors",
                active === h.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {h.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
