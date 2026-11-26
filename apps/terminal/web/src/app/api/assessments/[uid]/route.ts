/* Download one saved assessment as JSON (signed in; the file was validated on load). */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { COOKIE, launchToken, readSession } from "@/lib/auth/session";
import { loadAssessment } from "@/lib/data/store";
import { maskAssessment } from "@/lib/report/mask";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(_request: Request, ctx: { params: Promise<{ uid: string }> }) {
  const token = launchToken();
  if (!token || !readSession((await cookies()).get(COOKIE)?.value, token)) {
    return NextResponse.json({ detail: "Sign in first." }, { status: 401, headers: NO_STORE });
  }

  const { uid } = await ctx.params;
  const assessment = await loadAssessment(uid);
  if (!assessment) return NextResponse.json({ detail: "No such assessment." }, { status: 404, headers: NO_STORE });

  const safe = maskAssessment(assessment);
  return new NextResponse(JSON.stringify(safe, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe.uid}.json"`,
      ...NO_STORE,
    },
  });
}
