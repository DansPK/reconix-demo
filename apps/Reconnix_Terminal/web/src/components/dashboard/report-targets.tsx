"use client";

/* Every target across the saved runs, the most findings first: its runs, findings and worst
   severity; a row opens the newest run's report. Seven targets a page with the shared pager
   (report-targets-paging.ts; the page is `?tpage=` in the address). The list keeps room for a
   whole page, so a shorter last page neither shrinks the card nor moves the pager, which sits
   at the card's foot; the card stretches to the height of Findings by Severity beside it
   (styles/reports.css). */
import { DashCard } from "@/components/dashboard/dash-card";
import { targetsPage, targetsPagePatch } from "@/components/dashboard/report-targets-paging";
import type { ReportTargetRow } from "@/components/dashboard/report-types";
import { RunLinkTo } from "@/components/dashboard/run-link";
import { REPORT_KEYS, useQueryParams } from "@/components/dashboard/view-url";
import { Pagination } from "@/components/ui/pagination";
import { SeverityBadge } from "@/components/ui/status-badge";
import { DOCS } from "@/lib/docs-nav";

const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

export function ReportTargets({ targets }: { targets: ReportTargetRow[] }) {
  const [p, update] = useQueryParams(REPORT_KEYS);
  const { paging, rows, slots } = targetsPage(targets, p.tpage);
  return (
    <DashCard
      id="report-targets"
      title="Targets"
      docsHref={DOCS.exporting}
      meta={count(targets.length, "target")}
      className="dash-panel rep-targets"
      bodyClassName="rep-targets-body"
    >
      <ul aria-label="Targets" className="rep-targets-list" style={{ "--slots": slots } as React.CSSProperties}>
        {rows.map((t) => (
          <li key={t.target}>
            <RunLinkTo
              uid={t.latest.uid}
              label={`Open the newest report for ${t.target} (${t.latest.label}): ${count(t.runs, "run")}, ${count(t.findings, "finding")}`}
              className="dash-target-row"
            >
              <span className="min-w-0">
                <span className="block truncate font-mono text-xs text-foreground">{t.target}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {count(t.runs, "run")} · {count(t.findings, "finding")}
                </span>
              </span>
              {t.worst ? <SeverityBadge level={t.worst} /> : <span className="text-[11px] text-muted-foreground">no findings</span>}
            </RunLinkTo>
          </li>
        ))}
      </ul>
      <Pagination paging={paging} onPage={(n) => update(targetsPagePatch(n))} label="Target pages" className="rep-targets-pager" />
    </DashCard>
  );
}
