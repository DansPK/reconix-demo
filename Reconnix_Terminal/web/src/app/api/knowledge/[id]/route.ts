/* One Security knowledge file (signed in; src/proxy.ts checks the session too). DELETE removes
   it, from the page's own Origin: its index entry, its passages and its kept original, through the
   Python CLI (`remove <id>`, lib/knowledge/cli.ts), one change at a time. The id must be a
   knowledge id (32 hex digits) and listed before anything runs. */
import { NextResponse } from "next/server";

import { fail, NO_STORE } from "@/lib/assistant/access";
import { BAD_ID, GONE, isKnowledgeId, refuseKnowledge } from "@/lib/knowledge/access";
import { removeSource } from "@/lib/knowledge/commands";
import { oneAtATime } from "@/lib/knowledge/gate";
import { findKnowledge } from "@/lib/knowledge/list";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, ctx: Context) {
  const refused = await refuseKnowledge(request, true);
  if (refused) return refused;
  const { id } = await ctx.params;
  if (!isKnowledgeId(id)) return fail(BAD_ID, 400);
  if (!(await findKnowledge(id))) return fail(GONE, 404);
  const removed = await oneAtATime(() => removeSource(id));
  if (!removed.ok) return fail(removed.error, removed.status);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
