"use client";

/* Modal dialog to pick a report export format (PDF, JSON, DOCX) with a faithful preview matching
   the exported Core API document (services/ai/src/reconix_ai/reports/files.py and report.html). */
import { useEffect, useId, useRef, useState } from "react";
import { Download, FileCode2, FileSpreadsheet, FileText, Loader, X } from "lucide-react";

import { fetchWithin, useReportDownload } from "@/components/dashboard/use-file-download";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { useModalDialog } from "@/components/ui/use-modal-dialog";
import type { ReportFormat } from "@/lib/api/reports";
import { EXPORT_FORMATS, type ExportFormat } from "@/lib/report/formats";
import { cn } from "@/lib/utils";

export type ExportSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE" | "UNKNOWN";

export interface ExportFindingDoc {
  code: string;
  title: string;
  target: string;
  description: string;
  severity_status: ExportSeverity;
  finding_status: string;
  cvss_score: number | null;
  cwe_ids: string[];
  owasp_id: string[];
  cve_ids: string[];
  confidence: string;
}

export interface ExportToolRunDoc {
  tool: string;
  target: string;
  args: string[];
  risk_level: string;
  tool_run_status: string;
  approval_check: string;
}

export interface ExportDocumentPreview {
  meta: Record<string, string>;
  executive_summary: string;
  methodology: string;
  severity_counts: Record<ExportSeverity, number>;
  findings: ExportFindingDoc[];
  tool_runs: ExportToolRunDoc[];
}

export type ReportExportPreview = ExportDocumentPreview & {
  code: string;
  version: number | null;
};

const FORMAT_ORDER: readonly ReportFormat[] = ["PDF", "JSON", "DOCX"];
const SPEC_BY_UPPER = Object.fromEntries(EXPORT_FORMATS.map((s) => [s.id.toUpperCase(), s])) as Record<ReportFormat, (typeof EXPORT_FORMATS)[number]>;
const FORMAT_ICON: Record<ReportFormat, typeof FileText> = {
  PDF: FileText,
  JSON: FileCode2,
  DOCX: FileSpreadsheet,
};
const DEFAULT_LOCKED_HINT = "Generate and sign off a report in the TUI before exporting.";
const LEVELS: readonly ExportSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE", "UNKNOWN"];

const PDF_SEV_COLOR: Record<ExportSeverity, string> = {
  CRITICAL: "text-[#8b0000]",
  HIGH: "text-[#c0392b]",
  MEDIUM: "text-[#b9770e]",
  LOW: "text-[#1f618d]",
  NONE: "text-[#555]",
  UNKNOWN: "text-[#555]",
};

const PDF_CONF_COLOR: Record<string, string> = {
  CONFIRMED: "text-[#1e8449]",
  FIRM: "text-[#239b56]",
  TENTATIVE: "text-[#b9770e]",
  INFORMATIONAL: "text-[#777]",
};

function formatFromSpec(fmt: ReportFormat): ExportFormat {
  return fmt.toLowerCase() as ExportFormat;
}

function asDoc(raw: unknown, fallback: ExportDocumentPreview): ExportDocumentPreview {
  if (!raw || typeof raw !== "object") return fallback;
  const d = raw as Partial<ExportDocumentPreview>;
  if (!d.meta || !d.severity_counts || !Array.isArray(d.findings)) return fallback;
  return {
    meta: d.meta,
    executive_summary: d.executive_summary ?? "",
    methodology: d.methodology ?? "",
    severity_counts: d.severity_counts,
    findings: d.findings,
    tool_runs: Array.isArray(d.tool_runs) ? d.tool_runs : [],
  };
}

/** Matches services/ai/src/reconix_ai/reports/report.html rendered to PDF via WeasyPrint. */
function PdfPreview({ doc }: { doc: ExportDocumentPreview }) {
  const metaRows = Object.entries(doc.meta).filter(([k]) => k !== "title");
  return (
    <div className="rounded border border-[#c9ced6] bg-white p-6 font-sans text-[12px] leading-[1.45] text-[#1b1f24] shadow-sm">
      <h3 className="mb-3 text-[20px] font-bold tracking-tight text-[#1b1f24]">{doc.meta.title ?? "Reconix assessment report"}</h3>

      <table className="mb-4 w-full border-collapse text-left text-[11.5px]">
        <tbody>
          {metaRows.map(([name, value]) => (
            <tr key={name}>
              <td className="w-[35%] border border-[#c9ced6] px-2 py-1 text-[#555]">{name}</td>
              <td className="border border-[#c9ced6] px-2 py-1 break-all">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="mt-5 mb-1.5 border-b border-[#c9ced6] pb-0.5 text-[14px] font-bold">Executive summary</h4>
      <p className="whitespace-pre-wrap">{doc.executive_summary || "—"}</p>

      <h4 className="mt-5 mb-1.5 border-b border-[#c9ced6] pb-0.5 text-[14px] font-bold">Findings by severity</h4>
      <table className="w-full border-collapse text-left text-[11.5px]">
        <thead>
          <tr>
            <th className="border border-[#c9ced6] bg-[#eef1f5] px-2 py-1 font-semibold">Severity</th>
            <th className="border border-[#c9ced6] bg-[#eef1f5] px-2 py-1 font-semibold">Findings</th>
          </tr>
        </thead>
        <tbody>
          {LEVELS.map((level) => (
            <tr key={level}>
              <td className={cn("border border-[#c9ced6] px-2 py-1 font-bold", PDF_SEV_COLOR[level])}>{level}</td>
              <td className="border border-[#c9ced6] px-2 py-1 tabular-nums">{doc.severity_counts[level] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="mt-5 mb-1.5 border-b border-[#c9ced6] pb-0.5 text-[14px] font-bold">Methodology</h4>
      <p className="whitespace-pre-wrap">{doc.methodology || "—"}</p>

      <h4 className="mt-5 mb-1.5 border-b border-[#c9ced6] pb-0.5 text-[14px] font-bold">Findings</h4>
      {doc.findings.length === 0 ? (
        <p className="text-[#555]">No findings.</p>
      ) : (
        <div className="space-y-3">
          {doc.findings.map((finding) => {
            const ids = [...(finding.cwe_ids ?? []), ...(finding.owasp_id ?? []), ...(finding.cve_ids ?? [])];
            const level = LEVELS.includes(finding.severity_status) ? finding.severity_status : "UNKNOWN";
            return (
              <div key={finding.code}>
                <h5 className="text-[12.5px] font-bold">
                  {finding.code} {finding.title}
                </h5>
                <p className="my-0.5">
                  <span className={cn("font-bold", PDF_SEV_COLOR[level])}>{finding.severity_status}</span> ·{" "}
                  <span className={cn("font-bold lowercase [font-variant:small-caps]", PDF_CONF_COLOR[finding.confidence] ?? "text-[#555]")}>
                    {finding.confidence}
                  </span>{" "}
                  · <span className="break-all">{finding.target}</span>
                </p>
                <p className="my-1 whitespace-pre-wrap">{finding.description}</p>
                {ids.length > 0 && <p className="my-0.5 text-[#333]">References: {ids.join(", ")}</p>}
              </div>
            );
          })}
        </div>
      )}

      <h4 className="mt-5 mb-1.5 border-b border-[#c9ced6] pb-0.5 text-[14px] font-bold">Tool runs</h4>
      <table className="w-full border-collapse text-left text-[11px]">
        <thead>
          <tr>
            <th className="border border-[#c9ced6] bg-[#eef1f5] px-2 py-1 font-semibold">Tool</th>
            <th className="border border-[#c9ced6] bg-[#eef1f5] px-2 py-1 font-semibold">Target</th>
            <th className="border border-[#c9ced6] bg-[#eef1f5] px-2 py-1 font-semibold">Options</th>
            <th className="border border-[#c9ced6] bg-[#eef1f5] px-2 py-1 font-semibold">Risk</th>
            <th className="border border-[#c9ced6] bg-[#eef1f5] px-2 py-1 font-semibold">Approval</th>
            <th className="border border-[#c9ced6] bg-[#eef1f5] px-2 py-1 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {doc.tool_runs.length === 0 ? (
            <tr>
              <td colSpan={6} className="border border-[#c9ced6] px-2 py-1 text-[#555]">
                No tool runs recorded.
              </td>
            </tr>
          ) : (
            doc.tool_runs.map((run, idx) => (
              <tr key={`${run.tool}-${idx}`}>
                <td className="border border-[#c9ced6] px-2 py-1">{run.tool}</td>
                <td className="border border-[#c9ced6] px-2 py-1 break-all">{run.target}</td>
                <td className="border border-[#c9ced6] px-2 py-1 font-mono break-all">{run.args.join(" ")}</td>
                <td className="border border-[#c9ced6] px-2 py-1">{run.risk_level}</td>
                <td className={cn("border border-[#c9ced6] px-2 py-1", run.approval_check === "MISSING" && "font-bold text-[#c0392b]")}>
                  {run.approval_check}
                </td>
                <td className="border border-[#c9ced6] px-2 py-1">{run.tool_run_status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Matches services/ai/src/reconix_ai/reports/files.py to_docx(). */
function DocxPreview({ doc }: { doc: ExportDocumentPreview }) {
  const metaRows = Object.entries(doc.meta).filter(([k]) => k !== "title");
  return (
    <div className="rounded border border-slate-300 bg-white p-6 font-serif text-[12px] leading-relaxed text-slate-900 shadow-sm">
      <h3 className="mb-2 text-[20px] font-bold text-[#1f3864]">{doc.meta.title ?? "Reconix assessment report"}</h3>
      <div className="mb-4 space-y-0.5 text-[11.5px] text-slate-700">
        {metaRows.map(([name, value]) => (
          <p key={name}>
            {name}: <span className="break-all">{value}</span>
          </p>
        ))}
      </div>

      <h4 className="mt-4 mb-1 text-[14px] font-bold text-[#2f5496]">Executive summary</h4>
      <p className="whitespace-pre-wrap">{doc.executive_summary || "—"}</p>

      <h4 className="mt-4 mb-1 text-[14px] font-bold text-[#2f5496]">Findings by severity</h4>
      <table className="w-full border-collapse text-left text-[11.5px]">
        <thead>
          <tr>
            <th className="border border-slate-400 px-2 py-1 font-semibold">Severity</th>
            <th className="border border-slate-400 px-2 py-1 font-semibold">Findings</th>
          </tr>
        </thead>
        <tbody>
          {LEVELS.map((level) => (
            <tr key={level}>
              <td className="border border-slate-400 px-2 py-1">{level}</td>
              <td className="border border-slate-400 px-2 py-1 tabular-nums">{doc.severity_counts[level] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="mt-4 mb-1 text-[14px] font-bold text-[#2f5496]">Methodology</h4>
      <p className="whitespace-pre-wrap">{doc.methodology || "—"}</p>

      <h4 className="mt-4 mb-1 text-[14px] font-bold text-[#2f5496]">Findings</h4>
      {doc.findings.length === 0 ? (
        <p className="text-slate-600">No findings.</p>
      ) : (
        <div className="space-y-3">
          {doc.findings.map((finding) => {
            const ids = [...(finding.cwe_ids ?? []), ...(finding.owasp_id ?? []), ...(finding.cve_ids ?? [])];
            return (
              <div key={finding.code}>
                <h5 className="text-[12.5px] font-bold text-[#2f5496]">
                  {finding.code} {finding.title}
                </h5>
                <p className="my-0.5 text-[11px] text-slate-700">
                  Severity: {finding.severity_status} &nbsp;&nbsp; Confidence: {finding.confidence || "TENTATIVE"} &nbsp;&nbsp; Target:{" "}
                  <span className="break-all">{finding.target}</span>
                </p>
                <p className="my-1 whitespace-pre-wrap">{finding.description}</p>
                {ids.length > 0 && <p className="my-0.5 text-[11px] text-slate-700">References: {ids.join(", ")}</p>}
              </div>
            );
          })}
        </div>
      )}

      <h4 className="mt-4 mb-1 text-[14px] font-bold text-[#2f5496]">Tool runs</h4>
      <table className="w-full border-collapse text-left text-[11px]">
        <thead>
          <tr>
            <th className="border border-slate-400 px-2 py-1 font-semibold">Tool</th>
            <th className="border border-slate-400 px-2 py-1 font-semibold">Target</th>
            <th className="border border-slate-400 px-2 py-1 font-semibold">Options</th>
            <th className="border border-slate-400 px-2 py-1 font-semibold">Risk</th>
            <th className="border border-slate-400 px-2 py-1 font-semibold">Approval</th>
          </tr>
        </thead>
        <tbody>
          {doc.tool_runs.length === 0 ? (
            <tr>
              <td colSpan={5} className="border border-slate-400 px-2 py-1 text-slate-600">
                No tool runs recorded.
              </td>
            </tr>
          ) : (
            doc.tool_runs.map((run, idx) => (
              <tr key={`${run.tool}-${idx}`}>
                <td className="border border-slate-400 px-2 py-1">{run.tool}</td>
                <td className="border border-slate-400 px-2 py-1 break-all">{run.target}</td>
                <td className="border border-slate-400 px-2 py-1 break-all">{run.args.join(" ")}</td>
                <td className="border border-slate-400 px-2 py-1">{run.risk_level}</td>
                <td className="border border-slate-400 px-2 py-1">{run.approval_check}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ReportExportDialog({
  open,
  onClose,
  report,
  assessmentUid = null,
  lockedHint,
  preview,
}: {
  open: boolean;
  onClose: () => void;
  report: { id: string; version: number; formats: ReportFormat[] } | null;
  assessmentUid?: string | null;
  lockedHint?: string | null;
  preview: ReportExportPreview;
}) {
  const dialog = useModalDialog(open);
  const id = useId();
  const [selected, setSelected] = useState<ReportFormat>("PDF");
  const { state, download, downloadAssessment } = useReportDownload();
  const [liveDoc, setLiveDoc] = useState<{ reportId: string; rawText: string; parsed: ExportDocumentPreview } | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const fetchedFor = useRef<string | null>(null);
  const busy = state.kind === "busy";

  const close = () => {
    if (busy) return;
    onClose();
  };

  useEffect(() => {
    if (!open || !report || !report.formats.includes("JSON")) return;
    if (fetchedFor.current === report.id) return;
    const ctrl = new AbortController();
    queueMicrotask(() => setLoadingDoc(true));
    fetchWithin(`/api/core-reports/${encodeURIComponent(report.id)}/download?format=JSON`, 15_000, ctrl.signal, "application/json")
      .then(async (res) => {
        if (!res.ok) return;
        const parsedRaw = await res.json().catch(() => null);
        if (parsedRaw !== null && !ctrl.signal.aborted) {
          fetchedFor.current = report.id;
          setLiveDoc({
            reportId: report.id,
            rawText: JSON.stringify(parsedRaw, null, 2),
            parsed: asDoc(parsedRaw, preview),
          });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingDoc(false);
      });
    return () => ctrl.abort();
  }, [open, report, preview]);

  const canDownloadCore = Boolean(report && report.formats.includes(selected));
  const canExport = canDownloadCore || Boolean(assessmentUid);
  const spec = SPEC_BY_UPPER[selected];
  const activeDoc = report && liveDoc?.reportId === report.id ? liveDoc.parsed : preview;
  const jsonContent = report && liveDoc?.reportId === report.id ? liveDoc.rawText : JSON.stringify(preview, null, 2);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-about`}
      className="ui-dialog ui-dialog-wide"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClose={() => {
        if (!open) return;
        onClose();
      }}
    >
      <div className="ui-dialog-body" aria-busy={busy}>
        <header className="ui-dialog-head">
          <div>
            <h2 id={`${id}-title`} className="ui-dialog-title">
              Export report
            </h2>
            <p id={`${id}-about`} className="ui-dialog-text">
              {preview.code} · Choose the export type and preview it before downloading.
            </p>
          </div>
          <IconButton label="Close" onClick={close} disabled={busy} className="size-7">
            <X aria-hidden />
          </IconButton>
        </header>

        <div role="radiogroup" aria-label="Export format" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {FORMAT_ORDER.map((fmt) => {
            const info = SPEC_BY_UPPER[fmt];
            const Icon = FORMAT_ICON[fmt];
            const active = selected === fmt;
            const supported = !report || report.formats.includes(fmt) || Boolean(assessmentUid);
            return (
              <button
                key={fmt}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!supported}
                onClick={() => setSelected(fmt)}
                className={cn(
                  "flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-primary/60 bg-primary/10 text-foreground" : "border-border bg-surface/50 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-foreground">
                    <Icon className="size-3.5 text-primary" aria-hidden />
                    {info.label}
                  </span>
                  <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">.{formatFromSpec(fmt)}</span>
                </span>
                <span className="text-[11px] leading-snug text-muted-foreground">{info.title}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">Preview · {spec.title}</span>
            {loadingDoc && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader className="size-3 animate-spin" aria-hidden /> Loading report…
              </span>
            )}
          </div>
          {/* a tab stop with a name: the preview scrolls, so the keys must reach it (axe
              scrollable-region-focusable) */}
          <div
            role="region"
            aria-label={`Preview · ${spec.title}`}
            tabIndex={0}
            className="h-[360px] overflow-y-auto rounded-xl border border-border bg-background/60 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {selected === "PDF" && <PdfPreview doc={activeDoc} />}
            {selected === "DOCX" && <DocxPreview doc={activeDoc} />}
            {selected === "JSON" && (
              <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-foreground">{jsonContent}</pre>
            )}
          </div>
        </div>

        <footer className="ui-dialog-foot items-center justify-between">
          <span role={state.kind === "failed" ? "alert" : "status"} className="mr-auto text-xs text-muted-foreground">
            {state.kind !== "idle" ? state.text : !canExport ? (lockedHint || DEFAULT_LOCKED_HINT) : `${preview.code}${report ? `-v${report.version}` : ""}.${formatFromSpec(selected)}`}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="quiet" size="sm" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!canExport || busy}
              onClick={() => {
                if (canDownloadCore && report) void download(report.id, report.version, selected);
                else if (assessmentUid) void downloadAssessment(assessmentUid, selected, preview.code);
              }}
            >
              {busy ? <Loader className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
              Export {selected}
            </Button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
