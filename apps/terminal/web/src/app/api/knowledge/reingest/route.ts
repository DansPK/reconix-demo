/* Re-ingest the knowledge (signed in; src/proxy.ts checks the session too): GET reports the
   Core API's job (GET /knowledge/reingest), POST starts it (POST /knowledge/reingest, from the
   page's own Origin; ?scope=NEW only the documents waiting to be ingested, else ALL: the
   built-in knowledge again, every document embedded again and the waiting ones put in). One
   job at a time: the API's 409 comes back as it is. */
import { NextResponse } from "next/server";

import { NO_STORE } from "@/lib/assistant/access";
import { reingestStatus, startReingest } from "@/lib/api/knowledge";
import { coreFailure } from "@/lib/api/respond";
import { refuseKnowledge } from "@/lib/knowledge/access";

export async function GET(request: Request) {
  const refused = await refuseKnowledge(request, false);
  if (refused) return refused;
  try {
    return NextResponse.json(await reingestStatus(), { headers: NO_STORE });
  } catch (error) {
    return coreFailure(error, "The re-ingest could not be read.");
  }
}

export async function POST(request: Request) {
  const refused = await refuseKnowledge(request, true);
  if (refused) return refused;
  // NEW: only the documents waiting to be ingested; ALL: the built-in knowledge and every document
  const scope = new URL(request.url).searchParams.get("scope") === "NEW" ? "NEW" : "ALL";
  try {
    return NextResponse.json(await startReingest(scope), { status: 202, headers: NO_STORE });
  } catch (error) {
    return coreFailure(error, "The re-ingest could not be started.");
  }
}
