/* What the Assessments view's filters keep (search, status and template chips), and the counts
   its chips show. Pure functions over the saved runs (no I/O, no React), so the view and the
   unit tests share them. Values come from the address (`?q=api&status=Completed,Stopped&
   template=API`), so anything unknown is ignored rather than trusted. */
import type { LibraryItem, Status } from "@/lib/data/view-types";
import { ASSESSMENT_KEYS } from "@/components/dashboard/view-url";
import { RUN_STATUS, toneColor } from "@/lib/status";

import { type ChipOption, countBy, list, runMatches } from "./filters";

/** The address keys the view owns: view-url.ts's one list (a drill-down link clears exactly these). */
export { ASSESSMENT_KEYS };

/** The statuses in the order their chips are listed (lib/status.ts). */
export const RUN_STATUS_ORDER = Object.keys(RUN_STATUS) as Status[];

export interface RunFilter {
  q: string; // the search, as typed
  status: Status[]; // statuses to keep (empty: all)
  template: string[]; // template names to keep (empty: all)
}

export interface ChipCount {
  value: string;
  count: number;
}

const isStatus = (value: string): value is Status => Object.hasOwn(RUN_STATUS, value);

/** The filter the address names: unknown statuses and templates nobody ran are dropped. */
export function parseRunFilter(params: { q: string; status: string; template: string }, rows: LibraryItem[]): RunFilter {
  const known = new Set(rows.map((r) => r.template));
  return {
    q: params.q,
    status: list(params.status).filter(isStatus),
    template: list(params.template).filter((t) => known.has(t)),
  };
}

/** Whether any filter is on (the "Clear filters" button shows). */
export const runFilterActive = (f: RunFilter): boolean => f.q.trim() !== "" || f.status.length > 0 || f.template.length > 0;

export function runFilterMatches(item: LibraryItem, f: RunFilter): boolean {
  if (f.status.length && !f.status.includes(item.status)) return false;
  if (f.template.length && !f.template.includes(item.template)) return false;
  return runMatches(item, f.q.trim().toLowerCase());
}

/** The rows that pass every filter, in the order given (newest first). */
export const filterRuns = <T extends LibraryItem>(rows: T[], f: RunFilter): T[] => rows.filter((r) => runFilterMatches(r, f));

/** How many runs have each status, in RUN_STATUS order; statuses no run has are left out. */
export const statusCounts = (rows: LibraryItem[]): ChipCount[] => countBy(rows, (r) => r.status, RUN_STATUS_ORDER).filter((c) => c.count > 0);

/** How many runs used each template, commonest first (ties by name). */
export function templateCounts(rows: LibraryItem[]): ChipCount[] {
  return countBy(rows, (r) => r.template, [])
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** The status chips: each status some run has, with its meaning (lib/status.ts RUN_STATUS). */
export const statusChips = (rows: LibraryItem[]): ChipOption[] =>
  statusCounts(rows).map((c) => {
    const meaning = RUN_STATUS[c.value as Status];
    return { ...c, label: meaning.label, color: toneColor(meaning.tone), hint: meaning.hint };
  });

/** The template chips: each template some run used. */
export const templateChips = (rows: LibraryItem[]): ChipOption[] => templateCounts(rows).map((c) => ({ ...c, label: c.value, hint: `Runs of the ${c.value} template` }));
