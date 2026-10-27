/* The model that answers the AI Assistant's next question (signed in; src/proxy.ts checks
   the session too). PUT { providerId, model }: a saved provider's listed model whose address may be
   used now (a provider id is a random UUID: anything else, "environment" too, is refused before
   anything is read; no model comes from the environment). Needs the page's own Origin. Answers
   with the model picker's whole view (never a key); the next question is asked with the new
   model. */
import { NextResponse } from "next/server";

import { NO_STORE, refuse } from "@/lib/assistant/access";
import { SetActiveSchema } from "@/lib/assistant/models/requests";
import { modelsView } from "@/lib/assistant/models/resolve";
import { readBody, trouble } from "@/lib/assistant/models/respond";
import { setActive } from "@/lib/assistant/models/store";

export async function PUT(request: Request) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;
  const body = await readBody(request, SetActiveSchema, "Send { providerId, model } only: a saved provider's id and one of its models.");
  if (!body.ok) return body.response;
  try {
    await setActive(body.value);
    return NextResponse.json(await modelsView(), { headers: NO_STORE });
  } catch (error) {
    return trouble(error);
  }
}
