"use client";

/* The Assessment chip: just the list — a search over every saved run (past six), "All
   assessments" (the default, the Overview totals every saved run), one row per run, and the
   files that were skipped (a warning, so a broken file is never silently missing). Opening
   another run keeps the current view but drops the selected finding (it belongs to the old
   run). */
import { useState } from "react";
import Link from "next/link";
import { Check, Layers, TriangleAlert } from "lucide-react";
import type { Dashboard } from "@/components/dashboard/derive";
import { SearchField } from "@/components/dashboard/filter-bar";
import { Popover } from "@/components/dashboard/popover";
import { runMatches } from "@/components/dashboard/filters";
import { RunRow } from "@/components/dashboard/run-row";
import { CHIP, ChipTrigger, Row } from "@/components/dashboard/top-bar-chip";
import { useCurrentView, useRunHref } from "@/components/dashboard/view-url";
import type { LibraryItem, SkippedFile } from "@/lib/data/view-types";

export { CHIP, ChipTrigger, Row };

const ROW = "flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const SEARCH_AFTER = 6; // more saved runs than this: the list gets a search

/** The open run, as much as the switcher shows of it. */
export type SwitcherRun = Pick<Dashboard["assessment"], "uid" | "id" | "name">;

export function AssessmentSwitcher({
  current,
  items,
  skipped,
}: {
  current: SwitcherRun | null; // null: every saved run
  items: LibraryItem[];
  skipped: SkippedFile[];
}) {
  const view = useCurrentView();
  const href = useRunHref();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => runMatches(i, q));
  const showAllOption = view !== "reports";
  return (
    <Popover
      triggerClassName={CHIP}
      triggerAriaLabel="Choose an assessment"
      align="start"
      panelClassName="w-[min(320px,calc(100vw-32px))] p-2 text-xs"
      triggerContent={<ChipTrigger label="Assessment" value={current ? current.id : `All (${items.length})`} />}
    >
      {(close) => (
        <>
          {items.length > SEARCH_AFTER && (
            <div className="px-1.5 pb-1.5 pt-2">
              <SearchField label="Search saved assessments" placeholder="ID, template, target, status…" value={query} onChange={setQuery} />
            </div>
          )}
          <ul className="max-h-[260px] overflow-y-auto pt-1">
            {!q && showAllOption && (
              <li>
                <Link href={href(null)} onClick={close} aria-current={current ? undefined : "true"} className={ROW}>
                  <Layers className="size-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground">All assessments</span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">The Overview totals every saved run</span>
                  </span>
                  {!current && <Check className="size-3.5 shrink-0 text-primary" aria-hidden />}
                </Link>
              </li>
            )}
            {shown.map((item) => {
              const on = item.uid === current?.uid;
              return (
                <li key={item.uid}>
                  <Link href={href(item.uid)} onClick={close} aria-current={on ? "true" : undefined} className={ROW}>
                    <RunRow item={item} current={on} />
                  </Link>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-1.5 py-2 text-muted-foreground">No saved assessment matches.</li>}
          </ul>
          {skipped.length > 0 && (
            <details className="mx-1.5 mt-2 rounded-md border border-border p-2">
              <summary className="flex cursor-pointer items-center gap-1.5 text-warning">
                <TriangleAlert className="size-3.5" aria-hidden />
                {skipped.length} {skipped.length === 1 ? "file was" : "files were"} skipped
              </summary>
              <ul className="mt-1.5 space-y-1 font-mono text-[10px] text-muted-foreground">
                {skipped.map((s) => (
                  <li key={s.file} className="[overflow-wrap:anywhere]">
                    {s.file} · {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Popover>
  );
}
