/* The Security knowledge graph (signed in; src/proxy.ts checks the session too): every document
   and the references and topics it talks about (lib/api/knowledge.ts `graphData`). Names and
   counts only, never a passage. */
import { NextResponse } from "next/server";

import { NO_STORE } from "@/lib/assistant/access";
import { graphData } from "@/lib/api/knowledge";
import { CoreError } from "@/lib/api/core";
import { coreFailure } from "@/lib/api/respond";
import { refuseKnowledge } from "@/lib/knowledge/access";

export async function GET(request: Request) {
  const refused = await refuseKnowledge(request, false);
  if (refused) return refused;
  try {
    return NextResponse.json(await graphData(), { headers: NO_STORE });
  } catch (error) {
    // Static demo: no Core API, so the page shows its designed "No knowledge yet" state
    // (the Upload button is inert: the add routes answer 503 with a sentence).
    if (error instanceof CoreError && error.status === 0)
      return NextResponse.json({ items: [], references: {} }, { headers: NO_STORE });
    return coreFailure(error, "The knowledge graph could not be read.");
  }
}
