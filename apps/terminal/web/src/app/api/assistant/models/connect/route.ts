/* The model picker's "Set the provider" (signed in; src/proxy.ts checks the session too).
   Static demo: inert — the built-in Reconix model is fixed, so connecting answers 409 with a
   sentence; nothing is saved, tested or sent anywhere. Needs the page's own Origin. */
import { fail, refuse } from "@/lib/assistant/access";
import { ConnectSchema } from "@/lib/assistant/models/requests";
import { readBody } from "@/lib/assistant/models/respond";

export async function POST(request: Request) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;
  const body = await readBody(request, ConnectSchema, "Send { name, preset, baseUrl, models, apiKey?, activate? } only.");
  if (!body.ok) return body.response;
  return fail("This demo answers with its built-in Reconix model; adding providers is disabled.", 409);
}
