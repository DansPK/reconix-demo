/* What the Findings filters and the saved-run searches keep. Pure functions over the derived data (no I/O,
   no React), so the views and the unit tests share them. Filter values come from the address
   (`?sev=HIGH,LOW&val=review&q=sql`), so anything unknown is ignored rather than trusted. */
import type { FindingRow } from "@/components/dashboard/derive";
import { SEVERITIES } from "@/lib/data/schema";
import type { LibraryItem, Severity } from "@/lib/data/view-types";
import { type Paging, pageOf, paginate, slicePage } from "@/lib/paging";
import { FINDING_REVIEW, RUN_STATUS, SEVERITY_META, toneColor } from "@/lib/status";

import { plural } from "./derive-shared";

/** Worst first: the schema's four levels (lib/data/schema.ts); `?sev=INFO` is ignored. */
export const SEVERITY_ORDER = SEVERITIES;

/** Validation buckets: confirmed; open and not confirmed (to review); closed by triage. */
export const VALIDATION = ["confirmed", "review", "closed"] as const;
export type Validation = (typeof VALIDATION)[number];

export const list = (value: string): string[] => value.split(",").map((v) => v.trim()).filter(Boolean);

const has = (text: string, q: string) => text.toLowerCase().includes(q);

export function validationOf(f: FindingRow): Validation {
  if (f.confirmed) return "confirmed";
  return f.needsReview ? "review" : "closed";
}

/** Why a closed finding is closed (from its triage status). */
const CLOSED_AS: Record<string, string> = { fixed: "Fixed", accepted: "Accepted", "false-positive": "False positive" };

/** A finding's review badge label: Confirmed, Needs review, or why it is closed. */
export function reviewLabel(f: FindingRow): string {
  const v = validationOf(f);
  // hasOwn: a saved status is data, and "constructor" must not find Object's
  return v === "closed" ? (Object.hasOwn(CLOSED_AS, f.status) ? CLOSED_AS[f.status] : FINDING_REVIEW.closed.label) : FINDING_REVIEW[v].label;
}

/** The view's first line: how many findings (false positives left out, as on every other page),
    across how many assessments when every run is shown. */
export function findingsHeadline(total: number, across: number | null, falsePositives = 0): string {
  if (total === 0) {
    const where = across !== null ? "any saved assessment" : "this assessment";
    return falsePositives ? `No findings in ${where}, only ${plural(falsePositives, "false positive")}.` : `No findings in ${where} yet.`;
  }
  const runs = across !== null ? ` across ${plural(across, "assessment")}` : "";
  return `${plural(total, "finding")}${runs} · select one to see its evidence and remediation.`;
}

/** Whether an address's `finding` value looks like a key the view hands out (`F-001`, or
    `<uid>~F-001` across runs), so a notice may repeat it; anything else is never echoed. */
export const safeFindingKey = (value: string): boolean => /^[\w.-]{1,48}(~[\w.-]{1,48})?$/.test(value);

export interface FindingFilter {
  sev: string[]; // severities to keep (empty: all)
  val: string; // one of VALIDATION, or "" for all
  q: string;
  /** Whether false positives are listed (`?fp=1`). They are left out by default, as every count
      on the dashboard leaves them out, so the list's numbers are the Overview's. */
  fp: boolean;
}

/** The address value that lists the false positives. */
export const SHOW_FALSE_POSITIVES = "1";

/** The filter an address names: unknown severities and validation buckets are dropped, and only
    `fp=1` lists the false positives. */
export function parseFindingFilter(p: { sev: string; val: string; q: string; fp?: string }): FindingFilter {
  return {
    sev: list(p.sev).filter((s) => (SEVERITY_ORDER as readonly string[]).includes(s)),
    val: (VALIDATION as readonly string[]).includes(p.val) ? p.val : "",
    q: p.q,
    fp: p.fp === SHOW_FALSE_POSITIVES,
  };
}

/** Whether any filter is on (the "Clear filters" button shows; it hides the false positives again). */
export const filterActive = (f: FindingFilter) => f.sev.length > 0 || f.val !== "" || f.q.trim() !== "" || f.fp;

/** The findings the chips and the summary count: every one but the false positives, unless they
    are listed. */
export const listable = (findings: FindingRow[], fp: boolean) => (fp ? findings : findings.filter((f) => !f.falsePositive));

export function findingMatches(f: FindingRow, { sev, val, q, fp }: FindingFilter): boolean {
  if (f.falsePositive && !fp) return false;
  if (sev.length && !sev.includes(f.severity)) return false;
  if ((VALIDATION as readonly string[]).includes(val) && validationOf(f) !== val) return false;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [f.id, f.title, f.target, f.cwe, f.tool, f.category, f.run?.label ?? "", ...f.references].some((t) => has(t, needle));
}

/** Highest severity first, then the highest CVSS. */
export function sortFindings(findings: FindingRow[]): FindingRow[] {
  const rank = (s: string) => SEVERITY_ORDER.indexOf(s as Severity);
  return [...findings].sort((a, b) => rank(a.severity) - rank(b.severity) || (b.score ?? 0) - (a.score ?? 0));
}

/** A filter chip: a value with how many items have it, its meaning's label, colour and hint. */
export interface ChipOption {
  value: string;
  label: string;
  count: number;
  color?: string; // its meaning's colour (a CSS variable), shown as a dot beside the label
  hint?: string; // what it means (the tooltip)
}

/** One chip per severity (lib/status.ts SEVERITY_META: Critical, High, Medium, Low), worst
    first; levels with no finding are left out unless they are selected (so a selection can
    always be undone). */
export function severityChips(findings: FindingRow[], selected: readonly string[]): ChipOption[] {
  return countBy(findings, (f) => f.severity, SEVERITY_ORDER)
    .filter((c) => c.count > 0 || selected.includes(c.value))
    .map((c) => {
      const meaning = SEVERITY_META[c.value as Severity];
      return { ...c, label: c.value.toLowerCase(), color: meaning?.color, hint: meaning ? `${meaning.label}: ${meaning.hint}` : undefined };
    });
}

/** The one "False positives" chip: how many there are, on while they are listed. */
export function falsePositiveChips(findings: FindingRow[]): ChipOption[] {
  const meaning = FINDING_REVIEW.closed;
  return [
    {
      value: SHOW_FALSE_POSITIVES,
      label: "Show",
      count: findings.filter((f) => f.falsePositive).length,
      color: toneColor(meaning.tone),
      hint: "Findings an analyst marked as false positives in the TUI: left out of every count. Show them to read why.",
    },
  ];
}

/** One chip per validation bucket (lib/status.ts FINDING_REVIEW), every bucket listed. */
export function validationChips(findings: FindingRow[]): ChipOption[] {
  return countBy(findings, validationOf, VALIDATION).map((c) => {
    const meaning = FINDING_REVIEW[c.value as Validation];
    return { ...c, label: meaning.label, color: toneColor(meaning.tone), hint: meaning.hint };
  });
}


/** How many items fall in each bucket, in the order the buckets are listed. */
export function countBy<T>(items: T[], key: (item: T) => string, order: readonly string[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  const extra = [...counts.keys()].filter((k) => !order.includes(k)).sort();
  return [...order, ...extra].map((value) => ({ value, count: counts.get(value) ?? 0 }));
}

/** Whether a run matches a search: its ID, template, target, time, saved status or the status
    label shown on its badge ("waiting for you", "not started"). */
export const runMatches = (item: LibraryItem, q: string) =>
  !q || [item.id, item.template, item.target, item.status, RUN_STATUS[item.status].label, item.when].some((t) => t.toLowerCase().includes(q));

// --- the page and the selection -----------------------------------------------------------
// The address names a page (`?page=2`) and maybe a finding (`?finding=F-003`). An explicit
// finding wins: the page shown is the one that holds it, so a deep link opens on its row and
// paging never drops a selection. Without one, the page's first row is selected.

export interface FindingsPage {
  paging: Paging;
  rows: FindingRow[]; // the page's rows, in order
  current: FindingRow | null; // the selected finding (null only when `sorted` is empty)
  index: number; // its index in `sorted`, or -1
  explicit: boolean; // the address named it and it is in the list
  /** The address named a finding that is not in the list: a false positive while they are
      hidden, one hidden by the other filters, or an unknown one. */
  missing: "" | "false-positive" | "filtered" | "unknown";
}

/** The page to show and the finding to select, for the filtered and sorted list. `all` is the
    unfiltered list (to tell a filtered-out finding from an unknown one); `fpShown`, whether the
    false positives are listed. */
export function resolveFindingsPage(sorted: FindingRow[], all: FindingRow[], finding: string, page: string, fpShown = true): FindingsPage {
  const index = finding ? sorted.findIndex((f) => f.key === finding) : -1;
  if (index >= 0) {
    const paging = paginate(sorted.length, pageOf(index));
    return { paging, rows: slicePage(sorted, paging), current: sorted[index], index, explicit: true, missing: "" };
  }
  const paging = paginate(sorted.length, page);
  const rows = slicePage(sorted, paging);
  const current = rows[0] ?? null;
  const named = finding ? all.find((f) => f.key === finding) : undefined;
  const missing = !finding ? "" : !named ? "unknown" : named.falsePositive && !fpShown ? "false-positive" : "filtered";
  return { paging, rows, current, index: current ? paging.start : -1, explicit: false, missing };
}

/** The address value for a page: the first page is the plain address. */
export const pageParam = (page: number) => (page > 1 ? String(page) : "");

/** What changes in the address when the pager opens `page`: the selection stays only if its row
    is on that page; otherwise the page's first row is selected (the finding is dropped). */
export function pagePatch(sorted: FindingRow[], page: number, finding: string): { page: string; finding: string } {
  const paging = paginate(sorted.length, page);
  const keep = slicePage(sorted, paging).some((f) => f.key === finding);
  return { page: pageParam(paging.page), finding: keep ? finding : "" };
}

/** What changes in the address when a filter changes: back to the first page, and the selection
    stays only while it still matches. */
export function filterPatch(all: FindingRow[], filter: FindingFilter, finding: string): { page: string; finding: string } {
  const keep = finding !== "" && all.some((f) => f.key === finding && findingMatches(f, filter));
  return { page: "", finding: keep ? finding : "" };
}

/** The finding before and after `index` in the list (across pages), or null at each end. */
export function neighbours(sorted: FindingRow[], index: number): { prev: FindingRow | null; next: FindingRow | null } {
  if (index < 0) return { prev: null, next: null };
  return { prev: sorted[index - 1] ?? null, next: sorted[index + 1] ?? null };
}
