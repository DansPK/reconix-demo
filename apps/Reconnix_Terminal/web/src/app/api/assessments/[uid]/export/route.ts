/* Export one assessment, generated from the saved, already-redacted data, masked once more at
   this boundary (lib/report/mask.ts) before any format is built. `?format=` is one of
   lib/report/formats.ts (json, docx); every format is served as a download. A Word document
   past DOCX_MAX_MIB of text is a 413 (DOCX_TOO_LARGE). Every answer is no-store. */
import { NextResponse } from "next/server";

import { loadAssessment } from "@/lib/data/store";
import { DocxTooLarge } from "@/lib/report/docx/ooxml";
import { DOCX_TOO_LARGE, exportFileName, exportSpec, isExportFormat } from "@/lib/report/formats";
import { maskAssessment } from "@/lib/report/mask";
import { renderFile } from "@/lib/report/render";

const NO_STORE = { "Cache-Control": "no-store" };
const refuse = (detail: string, status: number) => NextResponse.json({ detail }, { status, headers: NO_STORE });

export async function GET(request: Request, ctx: { params: Promise<{ uid: string }> }) {
  const format = new URL(request.url).searchParams.get("format") ?? "";
  if (!isExportFormat(format)) return refuse("Unknown export format.", 400);
  if (format === "pdf") return refuse("PDF export is disabled in the static demo. Download JSON or DOCX instead.", 501);

  const { uid } = await ctx.params;
  const saved = await loadAssessment(uid);
  if (!saved) return refuse("No such assessment.", 404);
  const assessment = maskAssessment(saved);

  const headers = {
    "Content-Type": exportSpec(format).media,
    "Content-Disposition": `attachment; filename="${exportFileName(assessment.uid, format)}"`,
    ...NO_STORE,
  };

  try {
    return new NextResponse(renderFile(format, assessment), { headers });
  } catch (error) {
    if (error instanceof DocxTooLarge) return refuse(DOCX_TOO_LARGE, 413);
    throw error;
  }
}
