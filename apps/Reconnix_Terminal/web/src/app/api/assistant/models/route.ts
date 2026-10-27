/* The AI Assistant's models (signed in; src/proxy.ts checks the session too). GET: the saved
   providers without their keys (only whether one is saved), the active choice, a summary of the
   model that answers next and the presets in the model picker's order (each with its key rule
   and kind: cloud, local or custom). Every model is one saved here: none comes from the environment. POST adds a provider
   ({ name, preset, baseUrl, models, apiKey?, activate? }); it needs the page's own Origin. The
   key is sealed before it is saved and never comes back. Errors are fixed messages, never a
   path. */
import { NextResponse } from "next/server";

import { NO_STORE, refuse } from "@/lib/assistant/access";
import { PRESETS } from "@/lib/assistant/models/presets";
import { AddProviderSchema } from "@/lib/assistant/models/requests";
import { modelsView } from "@/lib/assistant/models/resolve";
import { readBody, trouble } from "@/lib/assistant/models/respond";
import { addProvider } from "@/lib/assistant/models/store";

export async function GET(request: Request) {
  const refused = await refuse(request, { change: false });
  if (refused) return refused;
  try {
    return NextResponse.json({ ...(await modelsView()), presets: PRESETS }, { headers: NO_STORE });
  } catch (error) {
    return trouble(error);
  }
}

export async function POST(request: Request) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;
  const body = await readBody(request, AddProviderSchema, "Send { name, preset, baseUrl, models, apiKey?, activate? } only.");
  if (!body.ok) return body.response;
  try {
    const provider = await addProvider(body.value);
    return NextResponse.json({ provider, ...(await modelsView()) }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return trouble(error);
  }
}
