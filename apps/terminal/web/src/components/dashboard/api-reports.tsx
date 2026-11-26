/* The Report view, from the Core API (server component), for one assessment (`?assessment=<uuid>`,
   shared with the Findings view): its summary strip (GET .../overview) and its report versions
   with their files (GET .../reports). With none picked, the Core API's assessments as a table,
   each opening its own report. Read-only, and no fallback: when the API is down or refuses, the
   view says what it said. */
import Link from "next/link";

import { ApiErrorNote, Shell } from "@/components/dashboard/api-findings";
import { DashCard } from "@/components/dashboard/dash-card";
import { type FindingRow, findingRow, findingsSlice } from "@/components/dashboard/derive";
import { plural } from "@/components/dashboard/derive-shared";
import { FindingsCard } from "@/components/dashboard/findings-card";
import { sortFindings } from "@/components/dashboard/filters";
import { ReportsListSkeleton, ReportsSkeleton } from "@/components/dashboard/page-skeletons";
import { ReportAssessmentCard } from "@/components/dashboard/report-assessment-card";
import { ReportDownloadBar } from "@/components/dashboard/report-download-bar";
import type { ExportSeverity, ReportExportPreview } from "@/components/dashboard/report-export-dialog";
import { ReportFindingsTable } from "@/components/dashboard/report-findings-table";
import { StatStrip } from "@/components/dashboard/stat-strip";
import { DocsLink, ViewHeader } from "@/components/dashboard/view-header";
import { EmptyNote } from "@/components/ui/empty-note";
import { apiFindingRows, overviewStats, reportRow } from "@/lib/api/adapt";
import { CoreApiError } from "@/lib/api/client";
import { type ApiAssessment, listAssessments, listFindings } from "@/lib/api/findings";
import { loadApiLibrary } from "@/lib/api/library";
import { listReports, readOverview } from "@/lib/api/reports";
import { assessmentView } from "@/lib/data/adapt";
import { DOCS } from "@/lib/docs-nav";

const header = (tag: string | undefined, about: string, extra?: React.ReactNode) => (
  <ViewHeader title="Report" tag={tag} about={about}>
    {extra}
    <DocsLink href={DOCS.exporting}>Report format</DocsLink>
  </ViewHeader>
);

/** Shown while the API answers (page.tsx streams the view behind it). */
export const ReportsLoading = ({ selected = false }: { selected?: boolean } = {}) =>
  selected ? <ReportsSkeleton /> : <ReportsListSkeleton />;

export async function ApiReports({ assessmentId }: { assessmentId: string | null }) {
  if (assessmentId === null) {
    let assessments: ApiAssessment[];
    try {
      assessments = await listAssessments();
    } catch (e) {
      if (!(e instanceof CoreApiError)) throw e;
      return (
        <Shell>
          {header(undefined, "Reports from the Core API.")}
          <ApiErrorNote e={e} />
        </Shell>
      );
    }
    return (
      <div className="dash-view dash-sheet" data-mode="all">
        {header(`All (${assessments.length})`, "Pick an assessment to see its reports and download their files.")}
        <AssessmentTable assessments={assessments} />
      </div>
    );
  }

  // Fetch overview, reports, findings and library in parallel (1 round-trip instead of 3 sequential waits).
  const settle = <T,>(p: Promise<T>) =>
    p.then(
      (value) => ({ value, error: null as CoreApiError | null }),
      (e: unknown) => {
        if (!(e instanceof CoreApiError)) throw e;
        return { value: null as T | null, error: e };
      },
    );
  const [overviewRes, reportsRes, apiFindings, library] = await Promise.all([
    settle(readOverview(assessmentId)),
    settle(listReports(assessmentId)),
    listFindings(assessmentId).catch(() => []),
    loadApiLibrary().catch(() => null),
  ]);
  const failed = overviewRes.error ?? reportsRes.error;
  if (!overviewRes.value || !reportsRes.value)
    return (
      <Shell>
        {header(undefined, "Reports from the Core API.")}
        {failed && failed.code !== "ASSESSMENT_NOT_FOUND" ? <ApiErrorNote e={failed} /> : <EmptyNote status>The Core API has no assessment with that id. Pick another one.</EmptyNote>}
      </Shell>
    );

  const overview = overviewRes.value;
  const reports = reportsRes.value;
  const matched = library?.assessments.find((item) => item.core_id === assessmentId || item.uid === assessmentId) ?? null;
  const view = matched ? assessmentView(matched) : null;
  const rawRows: FindingRow[] = apiFindings.length ? (apiFindingRows(apiFindings) as FindingRow[]) : view ? view.findings.map((f) => findingRow(f)) : [];
  const slice = findingsSlice(rawRows);
  const listed = sortFindings(rawRows.filter((f) => !f.falsePositive));

  const a = overview.assessment;
  const tag = [a.engagement_code, overview.targets[0]].filter(Boolean).join(" · ");
  const reportRows = reports.map(reportRow);
  const downloadable = reportRows.find((r) => r.locked === null) ?? null;
  const lockedHint = downloadable ? null : (reportRows[0]?.locked ?? null);
  const latestReport = reports[0] ?? null;
  const ver = downloadable?.version ?? latestReport?.version ?? null;
  const byCode = new Map(apiFindings.map((f) => [f.code, f]));
  const severityCounts = Object.fromEntries(
    (["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE", "UNKNOWN"] as const).map((lvl) => [lvl, overview.findings_by_severity[lvl] ?? 0]),
  ) as Record<ExportSeverity, number>;
  const preview: ReportExportPreview = {
    code: a.engagement_code,
    version: ver,
    meta: {
      title: `Reconix report ${a.engagement_code}`,
      Assessment: a.engagement_code,
      ...(ver !== null ? { Version: String(ver) } : {}),
    },
    executive_summary: latestReport?.executive_summary ?? "",
    methodology: latestReport?.methodology ?? "",
    severity_counts: severityCounts,
    findings: listed.map((f) => {
      const raw = byCode.get(f.id);
      return {
        code: f.id,
        title: f.title,
        target: f.target,
        description: f.description,
        severity_status: f.severity,
        finding_status: raw?.finding_status ?? f.status.toUpperCase(),
        cvss_score: f.score,
        cwe_ids: raw?.cwe_ids ?? (f.cwe !== "—" ? [f.cwe] : []),
        owasp_id: raw?.owasp_id ?? [],
        cve_ids: raw?.cve_ids ?? [],
        confidence: f.confirmed ? "CONFIRMED" : f.severity === "NONE" ? "INFORMATIONAL" : "TENTATIVE",
      };
    }),
    tool_runs: [],
  };
  return (
    <div className="dash-view dash-sheet" data-mode="run">
      {header(
        tag,
        `The summary of ${a.name} from the Core API. Download the full report in the format you need.`,
        <ReportDownloadBar report={downloadable} assessmentUid={matched?.uid ?? null} lockedHint={lockedHint} preview={preview} />,
      )}
      <StatStrip stats={overviewStats(overview)} label="Report summary" />
      <div className="dash-panels">
        <ReportAssessmentCard overview={overview} view={view} />
        <FindingsCard data={slice} id="report-findings-card" />
        <ReportFindingsTable findings={listed} />
      </div>
    </div>
  );
}

function AssessmentTable({ assessments }: { assessments: ApiAssessment[] }) {
  return (
    <div className="dash-panels">
      <DashCard id="report-assessments" title="Assessments" docsHref={DOCS.exporting} meta={plural(assessments.length, "assessment")} className="is-wide">
        {assessments.length === 0 ? (
          <EmptyNote>The Core API holds no assessment yet. Start one in the TUI.</EmptyNote>
        ) : (
          <div className="dash-table-scroll">
            <table aria-label="Core API assessments" className="dash-table">
              <thead>
                <tr>
                  <th scope="col">Assessment</th>
                  <th scope="col">Status</th>
                  <th scope="col">Targets</th>
                  <th scope="col">Findings</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((a) => (
                  <tr key={a.assessment_id}>
                    <th scope="row" className="font-normal">
                      <Link href={`/reports/${encodeURIComponent(a.assessment_id)}`} className="ui-link">
                        {a.name || a.assessment_id.slice(0, 8)}
                      </Link>
                    </th>
                    <td className="font-mono text-xs">{a.assessment_status}</td>
                    <td className="font-mono text-xs [overflow-wrap:anywhere]">{a.targets.join(", ") || "—"}</td>
                    <td className="tabnums">{a.finding_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>
    </div>
  );
}
