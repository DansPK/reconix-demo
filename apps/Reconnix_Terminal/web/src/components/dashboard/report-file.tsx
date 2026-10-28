"use client";

/* The report files the Report view fetches before it saves them: what each one is (its label,
   media type, how long to wait, what to say while it is built), the combined report's Generate
   button, and the status line that reports on the last file asked for (the combined report's,
   one run's downloads and the runs table's). The callers own the request (use-file-download.ts);
   these only show it. */
import { Download, FileJson, FileText, FileType, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CombinedFile } from "@/lib/report/combined/options";
import { DOCX_MEDIA, type ExportFormat } from "@/lib/report/formats";
import { cn } from "@/lib/utils";

export interface FileSpec {
  /** The format's name on the button and in the messages. */
  label: string;
  accept: string;
  /** How long to wait for the whole file. */
  timeoutMs: number;
  /** The status line while the file is built. */
  doing: string;
  Icon: LucideIcon;
}

/** Every file a report is saved as. The PDF gets the printer's own 90 s and some; the Word
    document and the JSON are built in memory. */
export const EXPORT_FILES: Record<ExportFormat, FileSpec> = {
  pdf: {
    label: "PDF",
    accept: "application/pdf",
    timeoutMs: 120_000,
    doing: "Generating the PDF on this computer — the download starts when the file is complete.",
    Icon: FileText,
  },
  json: {
    label: "JSON",
    accept: "application/json",
    timeoutMs: 30_000,
    doing: "Preparing the JSON snapshot — the download starts when the file is complete.",
    Icon: FileJson,
  },
  docx: {
    label: "DOCX",
    accept: DOCX_MEDIA,
    timeoutMs: 30_000,
    doing: "Generating the Word document — the download starts when the file is complete.",
    Icon: FileType,
  },
};

/** The combined report's two files, in the order of their buttons. */
export const COMBINED_FILES: Record<CombinedFile, FileSpec> = { pdf: EXPORT_FILES.pdf, docx: EXPORT_FILES.docx };
// Static demo: only DOCX is offered (PDF needed a headless Chrome, which the demo drops).
export const COMBINED_FILE_IDS: CombinedFile[] = ["docx"];

/** `of`: the run the file is about, named in the messages where several runs offer files. */
export type FileState =
  | { kind: "idle" }
  | { kind: "generating"; format: ExportFormat; of?: string }
  | { kind: "done"; format: ExportFormat; name: string; of?: string }
  /** 501: no browser to print the PDF with; the Word document is offered instead. */
  | { kind: "unsupported"; format: ExportFormat; message: string; docx: string; of?: string }
  /** 413: the Word document would be too large; asking again would not help. */
  | { kind: "refused"; format: ExportFormat; message: string; of?: string }
  | { kind: "failed"; format: ExportFormat; message: string; of?: string };

/** "Generate PDF" / "Generate DOCX": focusable while it can't act (aria-disabled, with the reason
    as its description), so focus is never dropped; `onGenerate` runs only when it can. */
export function GenerateButton({
  format,
  state,
  blocked,
  describedBy,
  onGenerate,
}: {
  format: CombinedFile;
  state: FileState;
  blocked: boolean;
  describedBy: string;
  onGenerate: (format: CombinedFile) => void;
}) {
  const { label, Icon } = COMBINED_FILES[format];
  const generating = state.kind === "generating" && state.format === format;
  return (
    <Button variant="outline" onClick={() => !blocked && onGenerate(format)} aria-disabled={blocked || undefined} aria-describedby={describedBy}>
      <Icon className="size-3.5" aria-hidden /> {generating ? `Generating ${label}…` : `Generate ${label}`}
    </Button>
  );
}

/** What the last file asked for is doing, with what to do next: Retry on a failure, the Word
    document on a 501, the reason on a 413. The region is always there (empty while idle), so a
    screen reader hears every change. */
export function FileStatus({ state, onRetry }: { state: FileState; onRetry: (format: ExportFormat) => void }) {
  const failed = state.kind === "failed" || state.kind === "unsupported" || state.kind === "refused";
  const spec = state.kind === "idle" ? null : EXPORT_FILES[state.format];
  return (
    <p
      role="status"
      className={cn("rep-status", state.kind === "idle" && "sr-only", failed && "is-error")}
      data-file={state.kind}
      data-format={state.kind === "idle" ? undefined : state.format}
    >
      {state.kind === "generating" && spec?.doing}
      {state.kind === "done" && `Downloaded ${state.name}.`}
      {state.kind === "unsupported" && (
        <>
          {state.message}{" "}
          <a href={state.docx} download className="ui-link inline-flex items-center gap-1">
            <Download className="size-3.5" aria-hidden /> Download DOCX
          </a>
        </>
      )}
      {state.kind === "refused" && state.message}
      {state.kind === "failed" && (
        <>
          The {spec?.label}
          {state.of ? ` of ${state.of}` : ""} could not be generated: {state.message}.{" "}
          <button type="button" onClick={() => onRetry(state.format)} className="ui-link">
            Retry
          </button>
        </>
      )}
    </p>
  );
}
