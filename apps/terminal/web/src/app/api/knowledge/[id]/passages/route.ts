/* One Security knowledge document's content (signed in; src/proxy.ts checks the session too):
   GET ?offset=&limit= gives a page of its passages from the Core API, masked, each with where its
   references and topics are named (so the page can highlight them). The id must be a document id. */
import { NextResponse } from "next/server";

import { fail, NO_STORE } from "@/lib/assistant/access";
import { passagesOf } from "@/lib/api/knowledge";
import { coreFailure } from "@/lib/api/respond";
import { BAD_ID, isKnowledgeId, refuseKnowledge } from "@/lib/knowledge/access";

type Context = { params: Promise<{ id: string }> };

const whole = (value: string | null, fallback: number, max: number) => {
  const n = Number(value ?? fallback);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, max) : fallback;
};

export async function GET(request: Request, ctx: Context) {
  const refused = await refuseKnowledge(request, false);
  if (refused) return refused;
  const { id } = await ctx.params;
  if (!isKnowledgeId(id)) return fail(BAD_ID, 400);
  const url = new URL(request.url);
  const offset = whole(url.searchParams.get("offset"), 0, 100_000);
  const limit = Math.max(1, whole(url.searchParams.get("limit"), 50, 100));
  try {
    return NextResponse.json(await passagesOf(id, offset, limit), { headers: NO_STORE });
  } catch (error) {
    return coreFailure(error, "The document's content could not be read.");
  }
}
