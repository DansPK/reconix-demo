/* The model that answers the AI Assistant's next question (signed in; src/proxy.ts checks the
   session too). Static demo: the built-in Reconix model is fixed and always active, so the
   choice is a no-op answered with the picker's whole view (never a key). Needs the page's own
   Origin. */
import { NextResponse } from "next/server";

import { DEMO_MODELS_VIEW } from "@/lib/api/models";
import { NO_STORE, refuse } from "@/lib/assistant/access";
import { SetActiveSchema } from "@/lib/assistant/models/requests";
import { readBody } from "@/lib/assistant/models/respond";

export async function PUT(request: Request) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;
  const body = await readBody(request, SetActiveSchema, "Send { providerId, model } only: a saved provider's id and one of its models.");
  if (!body.ok) return body.response;
  return NextResponse.json(DEMO_MODELS_VIEW, { headers: NO_STORE });
}
