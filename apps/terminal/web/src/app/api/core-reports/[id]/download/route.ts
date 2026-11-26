/* A report version's file (signed in; src/proxy.ts checks the session too). Static demo: the
   Core API is never there, so the saved run's own report renders instead — the same masked,
   generated-from-saved-data files as /api/assessments/<uid>/export (lib/report/mask.ts
   re-masks at this boundary too). The report id is the saved one ("<uid>-v<version>"); a
   version that isn't READY and signed off refuses, as the Core API's route does. */
import { signedIn } from "@/lib/auth/guard";
import { NextResponse } from "next/server";

import { loadAssessment } from "@/lib/data/store";
import { DocxTooLarge } from "@/lib/report/docx/ooxml";
import { DOCX_TOO_LARGE, downloadHref, exportFileName, exportSpec, isExportFormat, NO_PRINTER } from "@/lib/report/formats";
import { renderReportHtml } from "@/lib/report/html";
import { maskAssessment } from "@/lib/report/mask";
import { renderPdf } from "@/lib/report/pdf";
import { renderFile } from "@/lib/report/render";

const NO_STORE = { "Cache-Control": "no-store" };
const refuse = (detail: string, status: number) => NextResponse.json({ detail }, { status, headers: NO_STORE });

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await signedIn())) return refuse("Sign in first.", 401);

  const format = new URL(request.url).searchParams.get("format")?.toLowerCase() ?? "";
  if (!isExportFormat(format)) return refuse("Unknown report format.", 400);

  const { id } = await ctx.params;
  const m = /^(.+)-v(\d+)$/.exec(id);
  const saved = m ? await loadAssessment(m[1]) : null;
  if (!saved) return refuse("No such report.", 404);
  const version = Number(m?.[2]);
  const report = saved.reports.find((r) => r.version === version && r.report_id === id) ?? null;
  if (!report) return refuse("No such report.", 404);
  if (report.report_status !== "READY" || !report.signed_off)
    return refuse("That report is not signed off yet.", 409);

  const assessment = maskAssessment(saved);
  const headers = {
    "Content-Type": exportSpec(format).media,
    "Content-Disposition": `attachment; filename="${exportFileName(assessment.uid, format)}"`,
    ...NO_STORE,
  };

  if (format === "pdf") {
    const pdf = await renderPdf(renderReportHtml(assessment)).catch(() => null);
    if (!pdf) {
      return NextResponse.json(
        { detail: NO_PRINTER, docx: downloadHref(assessment.uid, "docx") },
        { status: 501, headers: NO_STORE },
      );
    }
    return new NextResponse(pdf, { headers });
  }
  try {
    return new NextResponse(renderFile(format, assessment), { headers });
  } catch (error) {
    if (error instanceof DocxTooLarge) return refuse(DOCX_TOO_LARGE, 413);
    throw error;
  }
}
