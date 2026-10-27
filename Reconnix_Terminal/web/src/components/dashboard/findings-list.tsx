"use client";

/* The Findings view's list pane: one page of rows (ten at most) and the pager under them
   (shown only with more than one page). On the fixed desktop frame the rows scroll on their own
   under the filters, with the pager kept in reach (styles/findings.css); elsewhere they grow with
   the window. The view owns the page and the selection (both in the address) and hands them
   down; the view turns the chosen page into an address change (filters.ts pagePatch keeps the
   selection when its row is on that page). */
import { useEffect, useRef } from "react";

import type { FindingRow } from "@/components/dashboard/derive";
import { FINDING_ICON } from "@/components/dashboard/finding-icon";
import { Pagination } from "@/components/ui/pagination";
import { SeverityBadge } from "@/components/ui/status-badge";
import type { Paging } from "@/lib/paging";
import { isScroller, revealWithin } from "@/lib/scroll";

export function FindingsList({
  rows,
  currentKey,
  paging,
  onOpen,
  onPage,
}: {
  rows: FindingRow[];
  currentKey: string | null; // the highlighted row (the selection, or the row a phone opened last)
  paging: Paging;
  onOpen: (key: string) => void;
  onPage: (page: number) => void;
}) {
  const list = useRef<HTMLUListElement>(null);

  // When the rows scroll on their own (the fixed frame), keep the selected one in view: Previous /
  // Next finding and deep links change it without a click on the row (lib/scroll.ts: by hand,
  // never scrollIntoView).
  useEffect(() => {
    const ul = list.current;
    const row = ul?.querySelector('[aria-current="true"]');
    if (ul && row && isScroller(ul)) revealWithin(row, ul);
  }, [currentKey]);

  return (
    <div className="dash-findings-list">
      <ul ref={list} className="dash-findings-rows" aria-label="Findings">
        {rows.map((f) => {
          const Icon = FINDING_ICON[f.icon];
          return (
            <li key={f.key}>
              <button
                type="button"
                data-finding-key={f.key}
                data-finding-id={f.id}
                data-severity={f.severity}
                aria-current={f.key === currentKey ? "true" : undefined}
                onClick={() => onOpen(f.key)}
                className="ui-row flex items-start gap-3 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="dash-tile mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg">
                  <Icon className="size-4 text-muted-foreground" strokeWidth={1.6} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{f.id}</span>
                    <SeverityBadge level={f.severity} />
                    {f.score != null && <span className="ml-auto font-mono text-[11px] tabnums text-foreground">{f.score.toFixed(1)}</span>}
                  </span>
                  <span className="mt-1 block truncate text-sm text-foreground">{f.title}</span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">{f.target}</span>
                  {f.run && <span className="mt-0.5 block truncate font-mono text-[10px] text-primary">{f.run.label}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Pagination paging={paging} onPage={onPage} label="Finding pages" className="dash-findings-pager" />
    </div>
  );
}
