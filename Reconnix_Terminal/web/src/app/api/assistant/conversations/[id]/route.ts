/* One saved conversation (signed in; src/proxy.ts checks the session too): GET reads it with
   every message and the cards shown with each reply, PATCH renames it ({ title }, masked, one
   line, at most 80 characters), DELETE deletes it. Changes need the page's own Origin; the id
   must be a conversation id (a random UUID) before anything is read. */
import { NextResponse } from "next/server";

import { fail, NO_STORE, readJson, refuse } from "@/lib/assistant/access";
import { cleanTitle, MAX_TITLE } from "@/lib/assistant/history-schema";
import { deleteConversation, HistoryError, readConversation, renameConversation } from "@/lib/assistant/history-store";
import { isConversationId } from "@/lib/assistant/protocol";
import { MAX_RENAME_BODY, RenameRequestSchema } from "@/lib/assistant/request";

type Context = { params: Promise<{ id: string }> };

const BAD_ID = "That is not a conversation id.";
const GONE = "That conversation is not saved any more.";
const trouble = (error: unknown) => fail(error instanceof HistoryError ? error.message : "The conversation could not be read or saved.", 500);

export async function GET(request: Request, ctx: Context) {
  const refused = await refuse(request, { change: false });
  if (refused) return refused;
  const { id } = await ctx.params;
  if (!isConversationId(id)) return fail(BAD_ID, 400);
  try {
    const conversation = await readConversation(id);
    if (!conversation) return fail(GONE, 404);
    return NextResponse.json({ conversation }, { headers: NO_STORE });
  } catch (error) {
    return trouble(error);
  }
}

export async function PATCH(request: Request, ctx: Context) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;
  const { id } = await ctx.params;
  if (!isConversationId(id)) return fail(BAD_ID, 400);
  const body = await readJson(request, MAX_RENAME_BODY);
  if (!body.ok) return body.response;
  const parsed = RenameRequestSchema.safeParse(body.value);
  if (!parsed.success) return fail("Send { title } only.", 400);
  const title = cleanTitle(parsed.data.title, 400);
  if (!title) return fail("Give the conversation a name.", 400);
  if (title.length > MAX_TITLE) return fail(`A name has at most ${MAX_TITLE} characters.`, 400);
  try {
    const renamed = await renameConversation(id, title);
    if (!renamed) return fail(GONE, 404);
    return NextResponse.json({ id: renamed.id, title: renamed.title }, { headers: NO_STORE });
  } catch (error) {
    return trouble(error);
  }
}

export async function DELETE(request: Request, ctx: Context) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;
  const { id } = await ctx.params;
  if (!isConversationId(id)) return fail(BAD_ID, 400);
  try {
    if (!(await deleteConversation(id))) return fail(GONE, 404);
    return NextResponse.json({ deleted: 1 }, { headers: NO_STORE });
  } catch (error) {
    return trouble(error);
  }
}
