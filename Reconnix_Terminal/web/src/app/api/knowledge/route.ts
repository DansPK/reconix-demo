/* The Security knowledge page's files (signed in; src/proxy.ts checks the session too).

   GET lists them from the knowledge index, read-only (lib/knowledge/list.ts): ids, names, kinds,
   sizes and times, never a path.

   POST adds one: a multipart body holding one file (≤ 10 MB, counted while it is read, 413 past
   it; .docx .pdf .txt .md .json .yaml .yml, and a .doc is told to become a .docx), from the page's
   own Origin. One upload at a time (429 while one runs) and ten a minute. The file is copied to a
   private temp file that the Python CLI adds as the TUI's /add-on does (lib/knowledge/cli.ts), and
   the copy is deleted whatever happened. 201 with the new file; the CLI's refusal is a 400 with
   its message; anything else a 500 with a fixed one. */
import { NextResponse } from "next/server";

import { fail, NO_STORE } from "@/lib/assistant/access";
import { refuseKnowledge } from "@/lib/knowledge/access";
import { addSource } from "@/lib/knowledge/commands";
import { BUSY, oneAtATime, takeUpload, TOO_MANY } from "@/lib/knowledge/gate";
import { listKnowledge } from "@/lib/knowledge/list";
import { readUpload, withPrivateCopy } from "@/lib/knowledge/upload";

export async function GET(request: Request) {
  const refused = await refuseKnowledge(request, false);
  if (refused) return refused;
  return NextResponse.json(await listKnowledge(), { headers: NO_STORE });
}

export async function POST(request: Request) {
  const refused = await refuseKnowledge(request, true);
  if (refused) return refused;
  const release = takeUpload();
  if (release === "busy") return fail(BUSY, 429);
  if (release === "rate") return fail(TOO_MANY, 429);
  try {
    const read = await readUpload(request);
    if (!read.ok) return read.response;
    const added = await withPrivateCopy(read.upload, (file) => oneAtATime(() => addSource(file, read.upload.name)));
    if (!added.ok) return fail(added.error, added.status);
    return NextResponse.json({ source: added.value }, { status: 201, headers: NO_STORE });
  } catch {
    return fail("The file could not be prepared for the knowledge tool. Try again.", 500);
  } finally {
    release();
  }
}
