/* The Core API's reports and one assessment's overview, read for the Report view (server only).
   Read-only: the web lists reports and downloads their files; making a report, combining and
   asking for the review sign-off stay in the TUI. Each answer is checked against the fields
   this view reads (docs/openapi.json ReportOut, AssessmentOverviewOut). shortcut: hand-written
   subset of the contract until `gen-api-types` is set up; switch to the generated types then. */
import "server-only";

import { cache } from "react";
import { z } from "zod";

import { requireSignedIn } from "../auth/guard";
import { type ApiFile, apiGet, apiGetFile, CoreApiError } from "./client";
import { isAssessmentId, parse, SEVERITY_STATUS } from "./findings";
import { localOverview, localReports } from "./local";

const str = z.string();
const opt = z.string().nullable();
const count = z.record(str, z.number());

export const REPORT_FORMATS = ["PDF", "DOCX", "JSON"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];
export const isReportFormat = (value: unknown): value is ReportFormat => (REPORT_FORMATS as readonly unknown[]).includes(value);

const ReportOut = z.object({
  report_id: str,
  version: z.number(),
  report_status: z.enum(["GENERATING", "READY", "FAILED"]),
  executive_summary: opt,
  methodology: opt,
  formats: z.array(z.enum(REPORT_FORMATS)),
  generated_by: str,
  generated_at: opt,
  created_at: str,
  assessment_id: str,
  assessment_ids: z.array(str),
  review_status: z.enum(["PENDING", "APPROVED", "REJECTED", "EXPIRED"]).nullable(),
  signed_off: z.boolean(),
});
export type ApiReport = z.infer<typeof ReportOut>;

const Overview = z.object({
  assessment: z.object({ assessment_id: str, name: str, engagement_code: str, assessment_status: str, created_at: str }),
  targets: z.array(str),
  finding_count: z.number(),
  findings_by_severity: z.partialRecord(z.enum(SEVERITY_STATUS), z.number()),
  findings_by_validation: count,
  plan_step_count: z.number(),
  plan_step_done_count: z.number(),
  tool_run_count: z.number(),
  request_count: z.number(),
  masked_count: z.number(),
  pending_approval_count: z.number(),
  duration_seconds: z.number(),
});
export type ApiOverview = z.infer<typeof Overview>;

function assessmentPath(id: string): string {
  if (!isAssessmentId(id)) throw new CoreApiError("BAD_REQUEST", "Not an assessment id.");
  return `/assessments/${encodeURIComponent(id)}`;
}

/** GET /assessments/{id}/reports: its reports newest first, then the combined ones covering it.
    Unreachable in the static demo: the saved run's report versions answer (lib/api/local.ts). */
export const listReports = cache(async (assessmentId: string): Promise<ApiReport[]> => {
  await requireSignedIn();
  try {
    return parse(z.array(ReportOut), await apiGet(`${assessmentPath(assessmentId)}/reports`), "reports");
  } catch (error) {
    if (error instanceof CoreApiError && error.code === "OFFLINE") return localReports(assessmentId);
    throw error;
  }
});

/** GET /assessments/{id}/overview: the counts the summary strip shows. */
export const readOverview = cache(async (assessmentId: string): Promise<ApiOverview> => {
  await requireSignedIn();
  try {
    return parse(Overview, await apiGet(`${assessmentPath(assessmentId)}/overview`), "overview");
  } catch (error) {
    if (error instanceof CoreApiError && error.code === "OFFLINE") return localOverview(assessmentId);
    throw error;
  }
});

/** GET /reports/{id}/download?format=: the file of a READY, signed-off report. */
export async function downloadReport(reportId: string, format: ReportFormat): Promise<ApiFile> {
  await requireSignedIn();
  if (!isAssessmentId(reportId)) throw new CoreApiError("BAD_REQUEST", "Not a report id."); // the same UUID shape
  if (!isReportFormat(format)) throw new CoreApiError("BAD_REQUEST", "Not a report format.");
  return apiGetFile(`/reports/${encodeURIComponent(reportId)}/download?format=${format}`);
}
