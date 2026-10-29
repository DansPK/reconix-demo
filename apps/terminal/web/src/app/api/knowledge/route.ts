/* The Security knowledge page's files. Static demo: GET only, read-only.

   GET lists them from the knowledge index (lib/knowledge/list.ts): ids, names, kinds, sizes and
   times, never a path. The demo has no upload/remove (those went through the TUI's Python
   /add-on code, which the static demo drops), so there is no POST. */
import { NextResponse } from "next/server";

import { NO_STORE } from "@/lib/assistant/access";
import { listKnowledge } from "@/lib/knowledge/list";

export async function GET() {
  return NextResponse.json(await listKnowledge(), { headers: NO_STORE });
}
