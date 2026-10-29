"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** A heading of the group page: a page's h2 (its part) or one of its sections' h3. */
export type DocsHeading = { id: string; title: string; level: 2 | 3; part: string };

/**
 * The group page's headings (`:is(h2, h3)[data-toc]` inside `[data-docs-content]`), each with
 * the part it belongs to, and the one being read: what "On this page" lists and the docs sidebar
 * marks. Read from the DOM after render (the page is server-rendered); an IntersectionObserver
 * follows the reading, so a jump to an anchor (a link, the search) moves the mark too.
 */
export function useDocsHeadings(): { headings: DocsHeading[]; active: string | null; activePart: string | null } {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<DocsHeading[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-docs-content] :is(h2, h3)[data-toc]")];
    let part = "";
    const found = els.map((el): DocsHeading => {
      const level = el.tagName === "H2" ? 2 : 3;
      if (level === 2) part = el.id;
      return { id: el.id, title: el.textContent ?? "", level, part };
    });
    // reading the DOM after render is the point of this effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeadings(found);
    const hash = decodeURIComponent(window.location.hash.slice(1));
    // until the observer reports, the heading in the address (or the first one) is "current"
    setActive(found.some((h) => h.id === hash) ? hash : (found[0]?.id ?? null));
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-100px 0px -65% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);

  const activePart = headings.find((h) => h.id === active)?.part ?? headings[0]?.part ?? null;
  return { headings, active, activePart };
}
