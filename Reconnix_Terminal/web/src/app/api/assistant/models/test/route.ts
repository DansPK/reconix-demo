/* The model picker's connection test (signed in; src/proxy.ts checks the session too): when
   the model's server lists no models, a model the provider is known to have, and a model name
   typed in "Set the provider" before it is saved. POST { providerId, model? } tests a saved
   provider as saved, POST { baseUrl, model, apiKey? } tests the picker's unsaved values; a saved
   key only ever goes to its saved address. The address is checked by the same rules as any model before anything is sent, then
   one tiny chat completion goes out (no redirects, ten seconds, no cache). Answers { ok, detail }
   in fixed words. Needs the page's own Origin; at most a few at a time. */
import { NextResponse } from "next/server";

import { fail, NO_STORE, refuse } from "@/lib/assistant/access";
import { createLimiter } from "@/lib/assistant/rate";
import { testConnection } from "@/lib/assistant/models/remote";
import { ProbeSchema } from "@/lib/assistant/models/requests";
import { probeTarget } from "@/lib/assistant/models/resolve";
import { readBody, trouble } from "@/lib/assistant/models/respond";

const limiter = createLimiter(30, 2);

export async function POST(request: Request) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;
  const body = await readBody(request, ProbeSchema, "Send { providerId, model? } or { baseUrl, model, apiKey? } only.");
  if (!body.ok) return body.response;
  let config;
  try {
    config = await probeTarget(body.value, true);
  } catch (error) {
    return trouble(error);
  }
  const release = limiter.take();
  if (!release) return fail("Too many tests at once. Wait a moment and try again.", 429);
  try {
    return NextResponse.json(await testConnection(config), { headers: NO_STORE });
  } finally {
    release();
  }
}
