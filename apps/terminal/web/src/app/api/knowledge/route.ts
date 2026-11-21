/* The Security knowledge page's documents, on the Core API (signed in; src/proxy.ts checks the
   session too): the knowledge add-ons the AI Assistant's agent searches.

   GET lists them (lib/api/knowledge.ts): ids, names, kinds, sizes, passages and times, never a
   path or a passage.

   POST adds one: a multipart body holding one file (≤ 10 MB, counted while it is read, 413 past
   it; .docx .pdf .txt .md .json .yaml .yml), from the page's own Origin. One upload at a time
   (429 while one runs) and ten a minute. The API reads, masks and splits it; its refusal comes
   back with its own words and status. 201 with the new document. */
import { NextResponse } from "next/server";

import { fail, NO_STORE } from "@/lib/assistant/access";
import { addItem, listItems, MAX_ADD_ONS } from "@/lib/api/knowledge";
import { coreFailure } from "@/lib/api/respond";
import { refuseKnowledge } from "@/lib/knowledge/access";
import { BUSY, takeUpload, TOO_MANY } from "@/lib/knowledge/gate";
import { readUpload } from "@/lib/knowledge/upload";

export async function GET(request: Request) {
  const refused = await refuseKnowledge(request, false);
  if (refused) return refused;
  try {
    return NextResponse.json({ state: "ok", items: await listItems(), max: MAX_ADD_ONS }, { headers: NO_STORE });
  } catch (error) {
    return coreFailure(error, "The knowledge documents could not be read.");
  }
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
    const source = await addItem(read.upload.name, read.upload.bytes);
    return NextResponse.json({ source }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return coreFailure(error, "The file could not be added. Try again.");
  } finally {
    release();
  }
}
