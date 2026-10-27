/* A Security knowledge file as it was added (signed in; src/proxy.ts checks the session too):
   the Python CLI decrypts the kept original (`original <id>`, lib/knowledge/cli.ts) and it is
   answered with its kind's type (lib/knowledge/original.ts): PDF and the text kinds inline, in a
   sandbox with nothing allowed, a Word file as a download; nosniff, never cached. The id must be
   a knowledge id and listed with an original before anything runs; the CLI's refusal is a 404. */
import { fail } from "@/lib/assistant/access";
import { BAD_ID, GONE, isKnowledgeId, refuseKnowledge } from "@/lib/knowledge/access";
import { readOriginal } from "@/lib/knowledge/commands";
import { findKnowledge } from "@/lib/knowledge/list";
import { originalHeaders } from "@/lib/knowledge/original";

type Context = { params: Promise<{ id: string }> };

const NO_ORIGINAL = "No original of this file was kept (it was added before originals were saved). Add it again to open it.";

export async function GET(request: Request, ctx: Context) {
  const refused = await refuseKnowledge(request, false);
  if (refused) return refused;
  const { id } = await ctx.params;
  if (!isKnowledgeId(id)) return fail(BAD_ID, 400);
  const item = await findKnowledge(id);
  if (!item) return fail(GONE, 404);
  if (!item.original) return fail(NO_ORIGINAL, 404);
  const read = await readOriginal(id);
  if (!read.ok) return fail(read.error, read.status);
  return new Response(new Uint8Array(read.value), { status: 200, headers: originalHeaders(item.kind, item.name, read.value.length) });
}
