/* The Core report lifecycle mirrored by local scripted snapshots. Shared by the UI and
   download route: a report's existence never implies that a reviewer signed it off. */
import type { ExportFormat } from "./formats";

export interface ReportVersion {
  report_id: string;
  version: number;
  report_status: "GENERATING" | "READY" | "FAILED";
  review_status: string | null;
  signed_off: boolean;
  formats: ("PDF" | "DOCX" | "JSON")[];
  generated_at: string | null;
}

/** The same refusal applies to visible buttons and direct requests to the export route. */
export function reportLock(report: ReportVersion | null | undefined): string | null {
  if (!report) return "No report version yet. Generate and review the report in the TUI.";
  if (report.report_status === "FAILED") return "Report generation failed. Generate a new version in the TUI.";
  if (report.report_status !== "READY") return "The report is still generating.";
  if (report.review_status === "REJECTED") return "Report review was rejected. A new review is required.";
  if (!report.signed_off || report.review_status !== "APPROVED") return "Awaiting report review and sign-off in the TUI.";
  return null;
}

/** Snapshots export their latest report only; previous versions are a read-only history. */
export function latestReport(reports: readonly ReportVersion[] | undefined): ReportVersion | null {
  return reports?.reduce<ReportVersion | null>((latest, report) =>
    !latest || report.version > latest.version ? report : latest, null) ?? null;
}

export function formatLock(report: ReportVersion | null | undefined, format: ExportFormat): string | null {
  const lock = reportLock(report);
  if (lock) return lock;
  return report?.formats.some((f) => f.toLowerCase() === format)
    ? null : `This version has no ${format.toUpperCase()} file.`;
}

export const reportReviewLabel = (report: ReportVersion) =>
  report.signed_off && report.review_status === "APPROVED" ? "Signed off" : report.review_status === "REJECTED" ? "Rejected" : "Awaiting sign-off";
