/* The Report view, for one run or every saved run (ReportCards, derive-report.ts), in the
   Overview's style. Findings by Severity lists the top 3 CVSS findings here (the Overview's card
   shows more). One run: the summary strip, its details and plan, Findings by Severity and
   the findings table, with every export format to download. Every run: the strip, Findings by
   Severity beside the targets (7 a page, the same height), and the runs with their reports —
   plus the Selection panel and preview
   that combine up to five of them into one report (ReportCombine). Server component. */
import { FindingsCard } from "@/components/dashboard/findings-card";
import { ReportDetails } from "@/components/dashboard/report-details";
import { ReportDownloads } from "@/components/dashboard/report-downloads";
import { ReportFindings } from "@/components/dashboard/report-findings";
import { ReportCombine } from "@/components/dashboard/report-selection";
import { ReportTargets } from "@/components/dashboard/report-targets";
import type { ReportCards } from "@/components/dashboard/report-types";
import { StatStrip } from "@/components/dashboard/stat-strip";
import { DocsLink, ViewHeader } from "@/components/dashboard/view-header";
import { DOCS } from "@/lib/docs-nav";

export function ReportsView({ data }: { data: ReportCards }) {
  return (
    <div className="dash-view dash-sheet" data-mode={data.mode}>
      <ViewHeader title="Report" tag={data.tag} about={data.about}>
        {data.mode === "run" && <ReportDownloads uid={data.uid} />}
        <DocsLink href={DOCS.exporting}>Report format</DocsLink>
      </ViewHeader>
      <StatStrip stats={data.stats} label="Report summary" />
      {data.mode === "run" ? (
        <div className="dash-panels">
          <ReportDetails details={data.details} plan={data.plan} />
          <FindingsCard id="report-severity" data={data.findings} />
          <ReportFindings rows={data.rows} />
        </div>
      ) : (
        <div className="dash-panels">
          <FindingsCard id="report-severity" data={data.findings} />
          <ReportTargets targets={data.targets} />
          <ReportCombine runs={data.runs} />
        </div>
      )}
    </div>
  );
}
