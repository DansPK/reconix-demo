"use client";

/* The Assessments view's controls: the search, one status chip per status some run has, one
   template chip per template used (both multi-select, with counts over every saved run), and
   "Showing 4 of 27 runs · Clear filters". Presentational: the view keeps the values in the
   address and does the filtering (assessments-filters.ts). */
import { type RunFilter, statusChips, templateChips } from "@/components/dashboard/assessments-filters";
import { FilterChips, FilterSummary, SearchField } from "@/components/dashboard/filter-bar";
import { RUN_SEARCH } from "@/components/dashboard/run-cells";
import type { LibraryItem } from "@/lib/data/view-types";

export type RunFilterPatch = Partial<Record<"q" | "status" | "template", string>>;

export function AssessmentsFilters({
  rows,
  filter,
  active,
  shown,
  onChange,
}: {
  rows: LibraryItem[];
  filter: RunFilter;
  active: boolean;
  shown: number;
  onChange: (patch: RunFilterPatch) => void;
}) {
  const statuses = statusChips(rows);
  const templates = templateChips(rows);
  return (
    <div className="asm-controls">
      <div className="asm-controls-row">
        <div className="w-full sm:w-[280px]">
          <SearchField label={RUN_SEARCH.label} placeholder={RUN_SEARCH.placeholder} value={filter.q} onChange={(q) => onChange({ q })} />
        </div>
        <FilterChips label="Status" multi options={statuses} selected={filter.status} onChange={(next) => onChange({ status: next.join(",") })} />
        <FilterChips label="Template" multi options={templates} selected={filter.template} onChange={(next) => onChange({ template: next.join(",") })} />
      </div>
      <FilterSummary shown={shown} total={rows.length} noun="run" active={active} onClear={() => onChange({ q: "", status: "", template: "" })} />
    </div>
  );
}
