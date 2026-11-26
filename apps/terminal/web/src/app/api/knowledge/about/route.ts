/* What a reference is (signed in; src/proxy.ts checks the session too): GET ?type=&ref=&label=
   asks the Core API's built-in knowledge base (/knowledge/search) and gives back its best entry
   for it (lib/api/knowledge.ts `aboutRef`), or null. */
import { NextResponse } from "next/server";
import { z } from "zod";

import { fail, NO_STORE } from "@/lib/assistant/access";
import { aboutRef } from "@/lib/api/knowledge";
import { coreFailure } from "@/lib/api/respond";
import { refuseKnowledge } from "@/lib/knowledge/access";

const Query = z.object({
  type: z.enum(["CVE", "CWE", "OWASP", "ATTACK", "TOOL", "TOPIC"]),
  ref: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
});

export async function GET(request: Request) {
  const refused = await refuseKnowledge(request, false);
  if (refused) return refused;
  const p = new URL(request.url).searchParams;
  const query = Query.safeParse({ type: p.get("type"), ref: p.get("ref"), label: p.get("label") ?? p.get("ref") });
  if (!query.success) return fail("Send ?type=, ?ref= and ?label= for one reference.", 400);
  try {
    return NextResponse.json({ about: await aboutRef(query.data.type, query.data.ref, query.data.label) }, { headers: NO_STORE });
  } catch (error) {
    return coreFailure(error, "The knowledge base could not be asked.");
  }
}
