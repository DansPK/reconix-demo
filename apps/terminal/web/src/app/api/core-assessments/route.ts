/* The Assessments view's rows from the Core API (signed in; src/proxy.ts checks the session
   too), for the view's live poll (components/dashboard/live-assessments.tsx). Read-only.
   A Core API refusal comes back as { detail } with the API's status; not reachable is 503. */
import { NextResponse } from "next/server";

import { loadAssessmentRows } from "@/lib/api/assessments";
import { CoreApiError } from "@/lib/api/client";
import { fail, NO_STORE, refuse } from "@/lib/assistant/access";

export async function GET(request: Request) {
  const refused = await refuse(request, { change: false });
  if (refused) return refused;
  try {
    return NextResponse.json({ rows: await loadAssessmentRows() }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof CoreApiError) return fail(`${error.message} (${error.code})`, error.status || 503);
    return fail("The assessments could not be read.", 500);
  }
}
