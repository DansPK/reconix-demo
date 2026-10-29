/* One run's findings as the report lists them: worst first, each with its severity and review
   state as badges, tool, weakness and CVSS. The ID opens the finding (evidence, remediation) in
   the Findings view. */
import { DashCard } from "@/components/dashboard/dash-card";
import type { ReportFindingRow } from "@/components/dashboard/report-types";
import { ViewLink } from "@/components/dashboard/view-link";
import { SeverityBadge, StatusBadge } from "@/components/ui/status-badge";
import { DOCS } from "@/lib/docs-nav";
import { reportFindingsMeta } from "@/components/dashboard/derive-report";
import { SHOW_FALSE_POSITIVES } from "@/components/dashboard/filters";

export function ReportFindings({ rows }: { rows: ReportFindingRow[] }) {
  return (
    <DashCard
      id="report-findings"
      title="Findings"
      docsHref={DOCS.findings}
      meta={reportFindingsMeta(rows)}
      className="is-wide"
    >
      {rows.length ? (
        <div className="dash-table-scroll">
          <table aria-label="Findings in this report" className="dash-table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Severity</th>
                <th scope="col">Finding</th>
                <th scope="col">Review</th>
                <th scope="col">Tool</th>
                <th scope="col">Weakness</th>
                <th scope="col">Rating</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.key}>
                  <th scope="row" className="font-normal">
                    <ViewLink view="findings" filters={{ finding: f.key, fp: f.falsePositive ? SHOW_FALSE_POSITIVES : undefined }} label={`Open ${f.id}: ${f.title}`} className="whitespace-nowrap rounded-sm font-mono text-primary underline-offset-2 hover:underline">
                      {f.id}
                    </ViewLink>
                  </th>
                  <td>
                    <SeverityBadge level={f.severity} />
                  </td>
                  <td className="min-w-[200px] text-foreground">{f.title}</td>
                  <td>
                    <StatusBadge meaning={f.review} />
                  </td>
                  <td className="font-mono text-muted-foreground">{f.tool}</td>
                  <td className="font-mono text-muted-foreground">{f.cwe}</td>
                  <td className="whitespace-nowrap font-mono text-muted-foreground">{f.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No findings in this assessment yet.</p>
      )}
    </DashCard>
  );
}
