/* The AI Assistant's saved conversations (signed in; src/proxy.ts checks the session too):
   GET lists them, newest first (pruned first); DELETE deletes every one, and needs the page's
   own Origin. */
import { NextResponse } from "next/server";

import { fail, NO_STORE, refuse } from "@/lib/assistant/access";
import { deleteAllConversations, HistoryError, listConversations, retentionDays } from "@/lib/assistant/history-store";

const trouble = (error: unknown) => fail(error instanceof HistoryError ? error.message : "The saved conversations could not be read.", 500);

export async function GET(request: Request) {
  const refused = await refuse(request, { change: false });
  if (refused) return refused;
  try {
    return NextResponse.json({ conversations: await listConversations(), retentionDays: retentionDays() }, { headers: NO_STORE });
  } catch (error) {
    return trouble(error);
  }
}

export async function DELETE(request: Request) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;
  try {
    return NextResponse.json({ deleted: await deleteAllConversations() }, { headers: NO_STORE });
  } catch (error) {
    return trouble(error);
  }
}
