"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import type { FindingRow } from "@/components/dashboard/derive";
import { plural } from "@/components/dashboard/derive-shared";
import { FilterChips, FilterSummary, SearchField } from "@/components/dashboard/filter-bar";
import { FindingDetail } from "@/components/dashboard/finding-detail";
import { FindingsList } from "@/components/dashboard/findings-list";
import {
  falsePositiveChips,
  filterActive,
  filterPatch,
  findingMatches,
  findingsHeadline,
  listable,
  neighbours,
  pagePatch,
  parseFindingFilter,
  resolveFindingsPage,
  safeFindingKey,
  SHOW_FALSE_POSITIVES,
  severityChips,
  sortFindings,
  validationChips,
} from "@/components/dashboard/filters";
import { ViewHeader } from "@/components/dashboard/view-header";
import { FINDINGS_KEYS, useQueryParams, writeQuery } from "@/components/dashboard/view-url";
import { EmptyNote } from "@/components/ui/empty-note";
import { ListDetail } from "@/components/ui/list-detail";
import { DOCS } from "@/lib/docs-nav";
import { revealCentred, revealTop } from "@/lib/scroll";

const NARROW = "(max-width: 1023.98px)"; // one pane at a time (components/ui/list-detail.tsx)

const narrow = () => window.matchMedia(NARROW).matches;

// --- the phone's history entry -------------------------------------------------------------
// A row opens the detail pane as a history entry marked in history.state, so Back (the
// browser's or the pane's) returns to the list; Forward lands on the marked entry again, and
// its Back still goes back rather than replacing. Next.js keeps its own keys beside ours.

interface FindingState {
  rxFinding?: boolean; // this page pushed the entry for the detail pane
}

const pushedHere = (): boolean => (window.history.state as FindingState | null)?.rxFinding === true;

/** Names `key` in the address: as a new history entry (`push`), or in place keeping the mark;
    `done` runs once it is written (view-url.ts: now, or after hydration). */
function writeFinding(key: string, mode: "push" | "replace", done?: () => void): boolean {
  const params = new URLSearchParams(window.location.search);
  params.set("finding", key);
  const state: FindingState = { rxFinding: mode === "push" || pushedHere() };
  return writeQuery(params, mode, state, done);
}

// Hydrated or not, without an effect: the server snapshot says no, the browser's says yes. Only
// the e2e specs read it (`data-ready`); the address writers gate themselves (view-url.ts).
const subscribeNever = () => () => {};
const useHydrated = () => useSyncExternalStore(subscribeNever, () => true, () => false);

/**
 * Findings: search and filter chips (severity, validation) over a list of ten rows a page, and
 * the selected finding's evidence and remediation beside it. Filters, the page and the
 * selection live in the address (`?sev=HIGH,LOW&val=review&q=sql&page=2&finding=F-001`), so
 * the Overview can drill into them and a link opens on its finding's page. With `across` set
 * the list holds every saved run's findings: each row names its run, and the selection is the
 * row's key (`<uid>~F-001`). The rules (which page, which row) are pure, in filters.ts.
 */
export function FindingsView({ findings, across = null }: { findings: FindingRow[]; across?: number | null }) {
  const [p, update] = useQueryParams(FINDINGS_KEYS);
  const root = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLElement>(null);
  const ready = useHydrated();
  // The row a phone opened last: highlighted and focused again when Back returns to the list.
  const [lastOpened, setLastOpened] = useState<string | null>(null);

  const filter = parseFindingFilter(p);
  const active = filterActive(filter);
  // False positives are left out of every count on the dashboard, so they are listed only on
  // request (`?fp=1`): the headline and the chips then agree with the Overview and the Reports.
  const counted = listable(findings, false);
  const falsePositives = findings.length - counted.length;
  const base = listable(findings, filter.fp);
  const sorted = sortFindings(findings.filter((f) => findingMatches(f, filter)));
  const page = resolveFindingsPage(sorted, findings, p.finding, p.page, filter.fp);
  const { prev, next } = neighbours(sorted, page.index);
  const pane = page.explicit ? "detail" : "list";
  const highlight = !page.explicit && lastOpened && page.rows.some((f) => f.key === lastOpened) ? lastOpened : page.current?.key ?? null;

  // A row: on a phone or tablet the detail pane replaces the list, as a history entry.
  const open = (key: string) => {
    if (!narrow()) return update({ finding: key });
    writeFinding(key, "push", () => setLastOpened(key)); // the row to return to, once the pane is open
  };
  const select = (key: string) => {
    if (narrow() && page.explicit) return writeFinding(key, "replace"); // the pane stays, and so does its mark
    update({ finding: key, page: "" });
  };
  const back = () => {
    if (pushedHere()) return window.history.back();
    update({ finding: "" }); // a link or a reload opened the detail: nothing to go back to
  };

  // The phone's panes and the keyboard: the detail pane takes focus and starts at its top (the
  // list may have been scrolled far down); back on the list, the row opened last takes focus
  // again, which brings it into view (lib/scroll.ts: by hand, never scrollIntoView, at the
  // content area's scroll padding).
  const wasPane = useRef(pane);
  useEffect(() => {
    const was = wasPane.current;
    wasPane.current = pane;
    if (!narrow()) return;
    if (pane === "detail") {
      const el = detail.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      revealTop(el);
    } else if (was === "detail" && lastOpened) {
      const el = root.current?.querySelector<HTMLElement>(`[data-finding-key="${CSS.escape(lastOpened)}"]`);
      if (!el) return;
      el.focus({ preventScroll: true });
      revealCentred(el);
    }
  }, [pane, page.current?.key, lastOpened]);

  const setFilter = (patch: Partial<Record<"sev" | "val" | "q" | "fp", string>>) => {
    const nextFilter = parseFindingFilter({ ...p, ...patch });
    update({ ...patch, ...filterPatch(findings, nextFilter, p.finding) });
  };
  const clearFilters = () => setFilter({ sev: "", val: "", q: "", fp: "" });

  const sevChips = severityChips(base, filter.sev);
  const valChips = validationChips(base);
  const fpChips = falsePositiveChips(findings);
  // the address's finding is repeated only when it looks like a key (it is untrusted input)
  const named = safeFindingKey(p.finding) ? <span className="font-mono text-foreground">{p.finding}</span> : null;

  return (
    <div ref={root} className="dash-view dash-findings" data-pane={pane} data-ready={ready ? "" : undefined}>
      <div className="mb-3">
        <ViewHeader title="Findings" about={findingsHeadline(counted.length, across, falsePositives)} />
      </div>

      {findings.length > 0 && (
        <div className="dash-findings-filters mb-4 flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="w-full sm:w-[260px]">
              <SearchField label="Search findings" placeholder="Search title, ID, CWE, target…" value={p.q} onChange={(q) => setFilter({ q })} />
            </div>
            <FilterChips label="Severity" multi options={sevChips} selected={filter.sev} onChange={(next) => setFilter({ sev: next.join(",") })} />
            <FilterChips
              label="Validation"
              options={valChips}
              selected={filter.val ? [filter.val] : []}
              onChange={([next]) => setFilter({ val: next === p.val ? "" : next })}
            />
            {falsePositives > 0 && (
              <FilterChips
                label="False positives"
                multi
                options={fpChips}
                selected={filter.fp ? [SHOW_FALSE_POSITIVES] : []}
                onChange={(next) => setFilter({ fp: next.length ? SHOW_FALSE_POSITIVES : "" })}
              />
            )}
          </div>
          <FilterSummary
            shown={sorted.length}
            total={counted.length}
            noun="finding"
            extra={filter.fp && falsePositives ? plural(falsePositives, "false positive") : undefined}
            active={active}
            onClear={clearFilters}
          />
        </div>
      )}

      {findings.length === 0 && (
        <EmptyNote className="dash-findings-empty">
          {across !== null
            ? "Findings appear here once a saved assessment records some."
            : "Findings appear here once this assessment's run records some. The Overview shows how far the run has come."}
        </EmptyNote>
      )}

      {findings.length > 0 && sorted.length === 0 && (
        <EmptyNote>
          {base.length === 0 && !active ? "Every finding here is a false positive: “Show” lists them." : "No finding matches these filters."}
        </EmptyNote>
      )}

      {page.missing && (
        <p role="status" className="dash-findings-notice mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
          <span className="min-w-0 break-all">
            {page.missing === "false-positive" ? (
              <>{named ?? "The finding this link names"} is marked as a false positive, and false positives are hidden.</>
            ) : page.missing === "filtered" ? (
              <>{named ?? "The finding this link names"} is hidden by the filters.</>
            ) : named ? (
              <>
                No finding {named} in {across !== null ? "the saved assessments" : "this assessment"}.
              </>
            ) : (
              "This link names a finding that isn't here."
            )}
          </span>
          {(page.missing === "filtered" || page.missing === "false-positive") && (
            <button
              type="button"
              onClick={() => update({ sev: "", val: "", q: "", page: "", fp: page.missing === "false-positive" || filter.fp ? SHOW_FALSE_POSITIVES : "" })}
              className="ui-link"
            >
              Show it
            </button>
          )}
          <button type="button" onClick={() => update({ finding: "" })} className="ui-link">
            Dismiss
          </button>
        </p>
      )}

      {page.current && (
        <ListDetail
          pane={pane}
          onBack={back}
          backLabel="Back to the findings"
          listLabel="Findings list"
          list={<FindingsList rows={page.rows} currentKey={highlight} paging={page.paging} onOpen={open} onPage={(n) => update(pagePatch(sorted, n, p.finding))} />}
          detail={<FindingDetail ref={detail} finding={page.current} position={{ index: page.index, total: sorted.length }} prev={prev} next={next} onSelect={select} />}
        />
      )}

      <p className="dash-findings-foot mt-4 text-xs text-muted-foreground">
        See{" "}
        <Link href={DOCS.findings} className="ui-link">
          the findings format
        </Link>{" "}
        for how severity, validation and evidence are recorded.
      </p>
    </div>
  );
}
