/* Wide Findings table at the bottom of the Report page: ID (links into Findings), Severity,
   Finding title, Review badge, Tool, Weakness (CWE), and CVSS Rating. */
import { DashCard } from "@/components/dashboard/dash-card";
import type { ListedFinding } from "@/components/dashboard/derive";
import { plural } from "@/components/dashboard/derive-shared";
import { ViewLink } from "@/components/dashboard/view-link";
import { SeverityBadge, StatusBadge } from "@/components/ui/status-badge";
import { DOCS } from "@/lib/docs-nav";
import { FINDING_REVIEW } from "@/lib/status";

export function reviewMeaning(f: ListedFinding) {
  if (f.confirmed) return FINDING_REVIEW.confirmed;
  if (f.needsReview) return FINDING_REVIEW.review;
  return FINDING_REVIEW.closed;
}

export function ReportFindingsTable({ findings }: { findings: ListedFinding[] }) {
  return (
    <DashCard id="report-findings-table" title="Findings" docsHref={DOCS.findings} meta={plural(findings.length, "finding")} className="is-wide">
      <div className="dash-table-scroll">
        <table aria-label="Assessment findings" className="dash-table">
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Severity</th>
              <th scope="col">Finding</th>
              <th scope="col">Review</th>
              <th scope="col">Tool</th>
              <th scope="col">Weakness</th>
              <th scope="col" className="text-right">
                Rating
              </th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => (
              <tr key={f.key}>
                <th scope="row" className="font-mono text-xs font-normal whitespace-nowrap">
                  <ViewLink view="findings" filters={{ finding: f.key }} label={`Open ${f.id} in Findings`} className="ui-link">
                    {f.id}
                  </ViewLink>
                </th>
                <td className="whitespace-nowrap">
                  <SeverityBadge level={f.severity} />
                </td>
                <td className="text-foreground">{f.title}</td>
                <td className="whitespace-nowrap">
                  <StatusBadge meaning={reviewMeaning(f)} />
                </td>
                <td className="font-mono text-xs text-muted-foreground">{f.tool}</td>
                <td className="font-mono text-xs whitespace-nowrap text-muted-foreground">{f.cwe}</td>
                <td className="text-right font-mono text-xs whitespace-nowrap tabnums text-muted-foreground">{f.rating}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashCard>
  );
}
