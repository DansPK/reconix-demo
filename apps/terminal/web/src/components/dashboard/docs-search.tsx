"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { DOCS_ENTRIES } from "@/lib/docs-nav";

/** Top-bar search: filters the docs entries by title + description, keyboard-navigable; a query
    that matches nothing says so. */
export function DocsSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  const results = q.trim()
    ? DOCS_ENTRIES.filter((e) => `${e.title} ${e.description}`.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : [];

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setOpen(false);
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active].href);
    }
  };

  return (
    <div className="relative hidden sm:block">
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKey}
        placeholder="Search docs…"
        aria-label="Search docs"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="docs-search-list"
        aria-autocomplete="list"
        className="h-[34px] w-[220px] rounded-[10px] border border-border bg-card pl-3 pr-9 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Search className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      {open && results.length > 0 && (
        <ul id="docs-search-list" role="listbox" className="dash-pop absolute right-0 top-[calc(100%+8px)] z-50 w-[300px] p-1">
          {results.map((r, i) => (
            <li key={r.href} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(r.href)}
                className={`flex w-full flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left ${i === active ? "bg-surface" : ""}`}
              >
                <span className="text-xs text-foreground">{r.title}</span>
                <span className="truncate text-[11px] text-muted-foreground">{r.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && q.trim() && results.length === 0 && (
        <p role="status" className="dash-pop absolute right-0 top-[calc(100%+8px)] z-50 w-[300px] px-3 py-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
          No docs page matches “{q.trim()}”.
        </p>
      )}
    </div>
  );
}
