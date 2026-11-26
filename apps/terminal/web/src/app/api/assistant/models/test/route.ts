/* The model picker's "Test connection" (signed in; src/proxy.ts checks the session too).
   Static demo: inert — the built-in Reconix model is fixed, so testing answers 409 with a
   sentence; nothing is asked anywhere. Needs the page's own Origin. */
import { fail, refuse } from "@/lib/assistant/access";
import { ProbeSchema } from "@/lib/assistant/models/requests";
import { readBody } from "@/lib/assistant/models/respond";

export async function POST(request: Request) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;
  const body = await readBody(request, ProbeSchema, "Send { providerId, model? } or { baseUrl, model, apiKey? } only.");
  if (!body.ok) return body.response;
  return fail("This demo answers with its built-in Reconix model; testing providers is disabled.", 409);
}
