/* The model list behind "Fetch models" in the model picker's "Set the provider" (signed in;
   src/proxy.ts checks the session too). POST { providerId } lists a saved provider's models as
   saved, POST { baseUrl, apiKey? } the picker's unsaved address; a saved key only ever goes to its saved address. The
   address is checked first, then GET {base}/models (no redirects, ten seconds, no cache, 1 MB
   at most). Answers { models }: the names a model name may be, sorted, at most 200; or, when
   the model's server answered without a list that could be read, { listed: false, detail } (the
   picker may then test a model it knows of, or have one typed). A model server that can't be
   asked (never reached, a redirect, a refused key, a limit, a list too large) is a 502 with a
   fixed reason. Needs the page's own Origin. */
import { NextResponse } from "next/server";

import { fail, NO_STORE, refuse } from "@/lib/assistant/access";
import { createLimiter } from "@/lib/assistant/rate";
import { fetchModels } from "@/lib/assistant/models/remote";
import { ProbeSchema } from "@/lib/assistant/models/requests";
import { probeTarget } from "@/lib/assistant/models/resolve";
import { readBody, trouble } from "@/lib/assistant/models/respond";

const limiter = createLimiter(30, 2);

export async function POST(request: Request) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;
  const body = await readBody(request, ProbeSchema, "Send { providerId } or { baseUrl, apiKey? } only.");
  if (!body.ok) return body.response;
  let config;
  try {
    config = await probeTarget(body.value, false);
  } catch (error) {
    return trouble(error);
  }
  const release = limiter.take();
  if (!release) return fail("Too many requests at once. Wait a moment and try again.", 429);
  try {
    const listed = await fetchModels(config);
    if (listed.ok) return NextResponse.json({ models: listed.models }, { headers: NO_STORE });
    return listed.unlisted ? NextResponse.json({ listed: false, detail: listed.detail }, { headers: NO_STORE }) : fail(listed.detail, 502);
  } finally {
    release();
  }
}
