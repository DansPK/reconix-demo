"use client";

/* One run's report in every export format (lib/report/formats.ts), served by
   /api/assessments/[uid]/export. Each is a button that fetches the file and then saves it
   (use-file-download.ts), so a refusal is shown rather than saved as a file: a PDF that can't be
   printed offers the Word document, a failure offers Retry (FileStatus). The one run's
   downloads (the Report view's header) and each row of the runs table share these. */
import { Download } from "lucide-react";

import { FileStatus } from "@/components/dashboard/report-file";
import { type FileRequest, useFileDownload } from "@/components/dashboard/use-file-download";
import { downloadHref, EXPORT_FORMATS, type ExportFormat, exportFileName } from "@/lib/report/formats";
import { cn } from "@/lib/utils";

/** What fetching run `uid`'s report as `format` asks for; `of` names the run in the messages. */
export const exportRequest = (uid: string, format: ExportFormat, of?: string): FileRequest => ({
  format,
  href: downloadHref(uid, format),
  docx: downloadHref(uid, "docx"),
  name: exportFileName(uid, format),
  of,
});

const CHIP =
  "dash-chip border border-border text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:opacity-60";

/** The three format buttons. `busy`: the format being fetched (its button says so). */
export function ExportButtons({
  uid,
  busy,
  onDownload,
  label,
  className,
}: {
  uid: string;
  busy: ExportFormat | null;
  onDownload: (uid: string, format: ExportFormat) => void;
  label?: (title: string) => string; // each button's accessible name, from the format's title
  className?: string;
}) {
  return (
    <>
      {EXPORT_FORMATS.map((f) => (
        <button
          key={f.id}
          type="button"
          data-export={f.id}
          title={f.blurb}
          aria-label={label?.(f.title)}
          aria-busy={busy === f.id || undefined}
          onClick={() => onDownload(uid, f.id)}
          className={cn(CHIP, className)}
        >
          {f.label}
        </button>
      ))}
    </>
  );
}

export function ReportDownloads({ uid }: { uid: string }) {
  const { file, download, retry } = useFileDownload();
  const busy = file.kind === "generating" ? file.format : null;
  return (
    <div className="flex max-w-full flex-col items-start gap-1 sm:max-w-[560px]">
      <nav aria-label="Download the report" className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-0.5 inline-flex items-center gap-1 text-muted-foreground">
          <Download className="size-3.5" aria-hidden /> Download
        </span>
        <ExportButtons uid={uid} busy={busy} onDownload={(u, f) => download(exportRequest(u, f))} className="h-[28px] px-3" />
      </nav>
      <FileStatus state={file} onRetry={retry} />
    </div>
  );
}
