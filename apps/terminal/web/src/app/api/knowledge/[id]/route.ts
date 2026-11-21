/* One Security knowledge document (signed in; src/proxy.ts checks the session too). DELETE
   removes it from the Core API's knowledge (DELETE /knowledge-add-ons/{id}): its passages leave
   the agent's search. From the page's own Origin; the id must be a document id (a UUID). */
import { NextResponse } from "next/server";

import { fail, NO_STORE } from "@/lib/assistant/access";
import { removeItem } from "@/lib/api/knowledge";
import { coreFailure } from "@/lib/api/respond";
import { BAD_ID, isKnowledgeId, refuseKnowledge } from "@/lib/knowledge/access";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, ctx: Context) {
  const refused = await refuseKnowledge(request, true);
  if (refused) return refused;
  const { id } = await ctx.params;
  if (!isKnowledgeId(id)) return fail(BAD_ID, 400);
  try {
    await removeItem(id);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    return coreFailure(error, "The document could not be removed.");
  }
}
