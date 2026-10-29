/* The export formats the dashboard offers for one assessment: one list that the Report view's
   downloads and the API route both read, so they can never disagree. Pure metadata and URL
   helpers; safe to import from client components. */

/** The Word document's media type (a plain constant: client code imports this file). */
export const DOCX_MEDIA = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type ExportFormat = "pdf" | "json" | "docx";

export interface ExportSpec {
  id: ExportFormat;
  /** Short name for the switcher and the menu. */
  label: string;
  /** Longer name for headings. */
  title: string;
  ext: string;
  media: string;
  /** What the file is for, in one sentence. */
  blurb: string;
}

/** The formats a report is saved in. The PDF is printed by a headless Chrome on the dashboard
    machine (lib/report/pdf.ts; 501 with the DOCX link when none is found). The report HTML
    remains the combined report's preview, never a download. */
export const EXPORT_FORMATS: readonly ExportSpec[] = [
  {
    id: "pdf",
    label: "PDF",
    title: "PDF report",
    ext: "pdf",
    media: "application/pdf",
    blurb: "The styled security report, printed to PDF on this computer. Page 1 is the one-page executive summary.",
  },
  {
    id: "json",
    label: "JSON",
    title: "JSON snapshot",
    ext: "json",
    media: "application/json; charset=utf-8",
    blurb: "The complete saved assessment, exactly as the terminal app wrote it (evidence already masked).",
  },
  {
    id: "docx",
    label: "DOCX",
    title: "Word document",
    ext: "docx",
    media: DOCX_MEDIA,
    blurb: "The same report as an editable Word document, to annotate or hand over (evidence already masked).",
  },
];

/** The 501 the PDF routes answer, and the Report view repeats, when no browser can print. */
export const NO_PRINTER =
  "PDF export needs a Chrome/Chromium browser on the dashboard machine (set RECONIX_CHROME). Download the Word (DOCX) report instead.";

/** The most text a Word report holds (its document.xml, in MB): past it both DOCX routes answer
    413 with DOCX_TOO_LARGE (lib/report/docx/ooxml.ts enforces it). */
export const DOCX_MAX_MIB = 16;

/** The 413 the DOCX routes answer, and the Report view repeats, when a report is too large. */
export const DOCX_TOO_LARGE = `This report is too large for a Word document (over ${DOCX_MAX_MIB} MB of text). Download the PDF or the JSON instead, or leave the evidence out of a combined report.`;

export const isExportFormat = (value: string): value is ExportFormat =>
  EXPORT_FORMATS.some((f) => f.id === value);

export function exportSpec(id: ExportFormat): ExportSpec {
  return EXPORT_FORMATS.find((f) => f.id === id) as ExportSpec;
}

export const exportFileName = (uid: string, id: ExportFormat) => `${uid}.${exportSpec(id).ext}`;

/** The API route that serves the file as a download. */
export const downloadHref = (uid: string, id: ExportFormat) =>
  `/api/assessments/${encodeURIComponent(uid)}/export?format=${id}`;
