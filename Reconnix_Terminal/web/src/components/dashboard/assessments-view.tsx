"use client";

/* The Assessments view (AssessmentsCards, derive-report.ts): every saved run, newest first, ten
   to a page. A search and the status and template chips narrow the rows (assessments-filters.ts);
   the values and the page live in the address (`?view=assessments&q=api&status=Completed&
   template=API&page=2`), so a reload or a link lands on the same rows. A row opens that run's
   Overview. The page shows EmptyView instead when nothing is saved; here the rows are never
   empty, only the match can be. */
import { useRef } from "react";

import { AssessmentsFilters } from "@/components/dashboard/assessments-filters-bar";
import { ASSESSMENT_KEYS, filterRuns, parseRunFilter, runFilterActive } from "@/components/dashboard/assessments-filters";
import { AssessmentsRows } from "@/components/dashboard/assessments-rows";
import type { AssessmentsCards } from "@/components/dashboard/report-types";
import { ViewHeader } from "@/components/dashboard/view-header";
import { useQueryParams } from "@/components/dashboard/view-url";
import { EmptyNote } from "@/components/ui/empty-note";
import { Pagination } from "@/components/ui/pagination";
import { paginate, slicePage } from "@/lib/paging";

export function AssessmentsView({ data }: { data: AssessmentsCards }) {
  const { rows } = data;
  const [p, update] = useQueryParams(ASSESSMENT_KEYS);
  const top = useRef<HTMLDivElement>(null);
  const filter = parseRunFilter(p, rows);
  const active = runFilterActive(filter);
  const shown = filterRuns(rows, filter);
  const paging = paginate(shown.length, p.page);
  const page = slicePage(shown, paging);

  const turn = (n: number) => update({ page: n > 1 ? String(n) : "" });

  return (
    <div className="dash-view dash-sheet" ref={top}>
      <ViewHeader title="Assessments" tag={data.tag} about={data.about} />

      <AssessmentsFilters rows={rows} filter={filter} active={active} shown={shown.length} onChange={(patch) => update({ ...patch, page: "" })} />

      {shown.length === 0 ? (
        <EmptyNote status>No saved run matches these filters.</EmptyNote>
      ) : (
        <>
          <AssessmentsRows rows={page} />
          <Pagination paging={paging} onPage={turn} label="Assessment pages" scrollTarget={top} />
        </>
      )}
    </div>
  );
}
