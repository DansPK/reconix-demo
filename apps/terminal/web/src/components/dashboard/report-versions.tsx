/* Build and review states of the report versions recorded in a scripted snapshot. */
import { DashCard } from "@/components/dashboard/dash-card";
import { EmptyNote } from "@/components/ui/empty-note";
import { shortDay, parseTime } from "@/lib/data/format";
import { DOCS } from "@/lib/docs-nav";
import { reportLock, reportReviewLabel, type ReportVersion } from "@/lib/report/lifecycle";

export function ReportVersions({ reports }: { reports: ReportVersion[] }) {
  const versions = [...reports].sort((a, b) => b.version - a.version);
  return (
    <DashCard id="report-versions" title="Report versions" docsHref={DOCS.exporting} meta={`${versions.length} saved`} className="is-wide">
      {versions.length ? (
        <div className="dash-table-scroll">
          <table aria-label="Report versions" className="dash-table">
            <thead><tr><th scope="col">Version</th><th scope="col">Build</th><th scope="col">Review</th><th scope="col">Generated</th><th scope="col">Files</th></tr></thead>
            <tbody>{versions.map((report) => {
              const lock = reportLock(report);
              const generated = parseTime(report.generated_at);
              return (
                <tr key={report.report_id}>
                  <th scope="row" className="font-normal">v{report.version}</th>
                  <td>{report.report_status}</td>
                  <td>{reportReviewLabel(report)}</td>
                  <td>{generated === null ? "—" : shortDay(generated)}</td>
                  <td title={lock ?? undefined}>{lock ?? report.formats.join(" · ")}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      ) : <EmptyNote>No report version yet. Report generation and review happen in the TUI.</EmptyNote>}
    </DashCard>
  );
}
