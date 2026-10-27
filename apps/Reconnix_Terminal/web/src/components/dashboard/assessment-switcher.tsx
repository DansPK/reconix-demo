"use client";

/* The Assessment chip: just the list. With a run open the panel starts with its name, a link to
   that run's Overview; then a search over every saved run (past six), "All assessments" (the
   default, the Overview totals every saved run), one row per run, and the files that were
   skipped (a warning, so a broken file is never silently missing). Opening another run keeps the
   current view but drops the selected finding (it belongs to the old run). */
import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Layers, TriangleAlert } from "lucide-react";
import type { Dashboard } from "@/components/dashboard/derive";
import { SearchField } from "@/components/dashboard/filter-bar";
import { Popover } from "@/components/dashboard/popover";
import { runMatches } from "@/components/dashboard/filters";
import { RunRow } from "@/components/dashboard/run-row";
import { runOverviewHref, useRunHref } from "@/components/dashboard/view-url";
import type { LibraryItem, SkippedFile } from "@/lib/data/view-types";

export const CHIP =
  "flex h-[34px] items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-xs transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-expanded:border-primary/50";

const ROW = "flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const SEARCH_AFTER = 6; // more saved runs than this: the list gets a search

export function ChipTrigger({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="hidden text-muted-foreground sm:inline">{label}:</span>
      <span className="max-w-[120px] truncate text-foreground min-[1440px]:max-w-[140px]">{value}</span>
      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </>
  );
}

export function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="tabnums flex min-w-0 items-center gap-1.5 truncate text-foreground">{v}</span>
    </div>
  );
}

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
  const href = useRunHref();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => runMatches(i, q));
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
          {current && (
            <div className="border-b border-border px-1.5 pb-2 pt-1">
              <Link
                href={runOverviewHref(current.uid)}
                onClick={close}
                aria-label={`Open the overview of ${current.name}`}
                className="rounded-sm text-[13px] font-medium text-primary underline-offset-2 [overflow-wrap:anywhere] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {current.name}
              </Link>
            </div>
          )}
          {items.length > SEARCH_AFTER && (
            <div className="px-1.5 pb-1.5 pt-2">
              <SearchField label="Search saved assessments" placeholder="ID, template, target, status…" value={query} onChange={setQuery} />
            </div>
          )}
          <ul className="max-h-[260px] overflow-y-auto pt-1">
            {!q && (
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
