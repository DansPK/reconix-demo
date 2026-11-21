/* Export one assessment (signed in), generated from the saved, already-redacted data, masked
   once more at this boundary (lib/report/mask.ts) before any format is built. `?format=` is
   one of lib/report/formats.ts (pdf, json, docx); every format is served as a download. The PDF
   needs a headless Chrome on this machine: 501 with the Word document's link otherwise. A Word
   document past DOCX_MAX_MIB of text is a 413 (DOCX_TOO_LARGE). Every answer is no-store. */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { COOKIE, launchToken, readSession } from "@/lib/auth/session";
import { loadAssessment } from "@/lib/data/store";
import { DocxTooLarge } from "@/lib/report/docx/ooxml";
import { DOCX_TOO_LARGE, downloadHref, exportFileName, exportSpec, isExportFormat, NO_PRINTER } from "@/lib/report/formats";
import { renderReportHtml } from "@/lib/report/html";
import { maskAssessment } from "@/lib/report/mask";
import { renderPdf } from "@/lib/report/pdf";
import { renderFile } from "@/lib/report/render";

const NO_STORE = { "Cache-Control": "no-store" };
const refuse = (detail: string, status: number) => NextResponse.json({ detail }, { status, headers: NO_STORE });

export async function GET(request: Request, ctx: { params: Promise<{ uid: string }> }) {
  const token = launchToken();
  if (!token || !readSession((await cookies()).get(COOKIE)?.value, token)) return refuse("Sign in first.", 401);

  const format = new URL(request.url).searchParams.get("format") ?? "";
  if (!isExportFormat(format)) return refuse("Unknown export format.", 400);

  const { uid } = await ctx.params;
  const saved = await loadAssessment(uid);
  if (!saved) return refuse("No such assessment.", 404);
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
        {
          detail: NO_PRINTER,
          docx: downloadHref(assessment.uid, "docx"),
        },
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
