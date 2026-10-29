/* One place that turns a saved assessment into the bytes of an export: the JSON as text, the
   Word document as a .docx (the PDF is printed by `pdf.ts` from the HTML). Server-only so the
   report renderers never ship to the browser. */
import "server-only";

import type { Assessment } from "@/lib/data/schema";

import { renderReportDocx } from "./docx/report";
import type { ExportFormat } from "./formats";

export type FileFormat = Exclude<ExportFormat, "pdf">;

export function renderFile(format: FileFormat, assessment: Assessment): string | Uint8Array<ArrayBuffer> {
  switch (format) {
    case "json":
      return `${JSON.stringify(assessment, null, 2)}\n`;
    case "docx":
      return renderReportDocx(assessment);
  }
}
