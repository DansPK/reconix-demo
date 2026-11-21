"use client";

/* Header export control for the Report view: "Download" and one chip per format (PDF, JSON,
   DOCX), each saving that file at once. A version the Core API signed off downloads its own
   file (/api/core-reports/<id>/download); otherwise the saved run's export
   (/api/assessments/<uid>/export). A saved file is announced as a toast; the progress and a
   refusal are shown under the chips, and a refusal is never saved as a file. */
import { useEffect } from "react";
import { Download } from "lucide-react";

import type { ReportExportPreview } from "@/components/dashboard/report-export-dialog";
import { useReportDownload } from "@/components/dashboard/use-file-download";
import { toast } from "@/components/ui/toast";
import type { ReportFormat } from "@/lib/api/reports";
import { EXPORT_FORMATS } from "@/lib/report/formats";

const CHIP =
  "dash-chip h-[28px] border border-border px-3 text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

const DEFAULT_LOCKED_HINT = "No report file to download yet.";

export function ReportDownloadBar({
  report,
  assessmentUid,
  lockedHint,
  preview,
}: {
  report: { id: string; version: number; formats: ReportFormat[] } | null;
  assessmentUid?: string | null;
  lockedHint?: string | null;
  preview: ReportExportPreview;
}) {
  const { state, download, downloadAssessment } = useReportDownload();
  const busy = state.kind === "busy";

  useEffect(() => {
    if (state.kind === "done") toast(state.text); // "Saved RCX-…-v1.pdf."
  }, [state]);

  return (
    <div className="flex max-w-full flex-col items-start gap-1 sm:max-w-[560px]">
      <nav aria-label="Download the report" className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-0.5 inline-flex items-center gap-1 text-muted-foreground">
          <Download className="size-3.5" aria-hidden /> Download
        </span>
        {EXPORT_FORMATS.map((f) => {
          const format = f.label as ReportFormat;
          const fromCore = Boolean(report && report.formats.includes(format));
          const enabled = fromCore || Boolean(assessmentUid);
          return (
            <button
              key={f.id}
              type="button"
              data-export={f.id}
              title={enabled ? f.blurb : lockedHint || DEFAULT_LOCKED_HINT}
              aria-disabled={!enabled || busy || undefined}
              onClick={() => {
                if (!enabled || busy) return;
                if (fromCore && report) void download(report.id, report.version, format);
                else if (assessmentUid) void downloadAssessment(assessmentUid, format, preview.code);
              }}
              className={CHIP}
            >
              {f.label}
            </button>
          );
        })}
      </nav>
      {(state.kind === "busy" || state.kind === "failed") && (
        <span role={state.kind === "failed" ? "alert" : "status"} className="text-xs text-muted-foreground">
          {state.text}
        </span>
      )}
    </div>
  );
}
