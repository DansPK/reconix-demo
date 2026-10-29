"use client";

import { useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { DocsSearchEntry } from "@/lib/docs-search-index";
import { revealTop } from "@/lib/scroll";
import { cn } from "@/lib/utils";

/** One result: the page, and the anchor on this page it jumps to (the page's, or a section's). */
type Hit = { entry: DocsSearchEntry; anchor: string; heading?: string; score: number };

const normalise = (s: string) => s.trim().toLowerCase();

/** Rank one page against the query: the title first, then a command alias, a heading, the description. */
function match(entry: DocsSearchEntry, q: string): Hit | null {
  const title = entry.title.toLowerCase();
  const bare = q.replace(/^\//, "");
  const page = entry.anchor;
  if (title === q || title === `/${bare}`) return { entry, anchor: page, score: 100 };
  if (title.startsWith(q) || title.replace(/^\//, "").startsWith(bare)) return { entry, anchor: page, score: 80 };
  if (entry.keywords.some((k) => k.toLowerCase().startsWith(q) || k.toLowerCase().replace(/^\//, "").startsWith(bare))) {
    return { entry, anchor: page, score: 70 };
  }
  if (title.includes(q)) return { entry, anchor: page, score: 60 };
  const heading = entry.headings.find((h) => h.title.toLowerCase().includes(q));
  if (heading) return { entry, anchor: heading.id, heading: heading.title, score: 50 };
  if (entry.description.toLowerCase().includes(q)) return { entry, anchor: page, score: 30 };
  return null;
}

export function searchDocs(index: DocsSearchEntry[], query: string, limit = 8): Hit[] {
  const q = normalise(query);
  if (!q) return [];
  return index
    .map((entry) => match(entry, q))
    .filter((h): h is Hit => h !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Go to an anchor on this page, never to another page: a new hash is followed by the browser
 * (it scrolls whichever box holds the heading, honouring its scroll-margin, and "On this page"
 * follows); the hash already in the address scrolls back to its heading by hand.
 */
function jumpTo(anchor: string): void {
  const el = document.getElementById(anchor);
  if (!el) return;
  if (window.location.hash !== `#${anchor}`) {
    window.location.hash = anchor;
    return;
  }
  const smooth = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
  revealTop(el, { when: "always", behavior: smooth ? "smooth" : "instant" });
}

/**
 * The docs' own search box (top of the docs sidebar): looks through the pages of the group shown
 * (their titles, section headings, descriptions and command aliases), keyboard-navigable
 * (↑ ↓ Enter Esc). A result jumps to its part, or its section, on this page.
 */
export function DocsSearch({ index }: { index: DocsSearchEntry[] }) {
  const listId = useId();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  // the list closes a moment after the box loses focus (a click on an option lands first); a jump
  // to an anchor moves focus to the page, so focusing the box again cancels that pending close
  const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keepOpen = () => clearTimeout(closing.current);

  const hits = searchDocs(index, q);
  const shown = open && hits.length > 0;
  const current = Math.min(active, Math.max(hits.length - 1, 0)); // the hits may have shrunk under the arrows

  const go = (anchor: string) => {
    setOpen(false);
    setQ("");
    jumpTo(anchor);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setOpen(false);
    if (!hits.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(hits[current].anchor);
    }
  };

  return (
    <div className="docs-search relative">
      <input
        type="search"
        value={q}
        onChange={(e) => {
          keepOpen();
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          keepOpen();
          setOpen(true);
        }}
        onBlur={() => {
          keepOpen();
          closing.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKey}
        placeholder="Search this section…"
        aria-label="Search this section"
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown ? `${listId}-${current}` : undefined}
        className="h-10 w-full rounded-[10px] border border-border bg-card pl-3 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <ul
        id={listId}
        role="listbox"
        aria-label="Search results"
        hidden={!shown}
        className="docs-search-list absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-80 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg"
      >
        {/* each option is itself the thing to click (no control inside it: the box keeps the
            keyboard, aria-activedescendant names the active one); the active one's fill is 6 %
            of the primary, light enough for its muted line to read at 4.5:1 */}
        {hits.map((h, i) => (
          <li
            key={h.anchor}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === current}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => go(h.anchor)}
            className={cn("flex cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left", i === current && "bg-primary/6")}
          >
            <span className="text-sm text-foreground">{h.entry.title}</span>
            <span className="truncate text-[11px] text-muted-foreground">{h.heading ?? h.entry.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
