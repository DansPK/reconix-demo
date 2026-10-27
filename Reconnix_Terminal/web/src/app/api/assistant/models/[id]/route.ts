/* One saved provider of the AI Assistant's models (signed in; src/proxy.ts checks the session
   too). PATCH changes it ({ name?, preset?, baseUrl?, models?, apiKey?, removeKey? }: no apiKey
   keeps the saved key while the address stays on its host); DELETE removes it and its key (the
   active choice goes with it). Both need the page's own Origin; the id must be a provider id
   (a random UUID) before anything is read. Answers carry the model picker's whole view, never a
   key. */
import { NextResponse } from "next/server";

import { fail, NO_STORE, refuse } from "@/lib/assistant/access";
import { UpdateProviderSchema } from "@/lib/assistant/models/requests";
import { modelsView } from "@/lib/assistant/models/resolve";
import { readBody, trouble } from "@/lib/assistant/models/respond";
import { isProviderId } from "@/lib/assistant/models/schema";
import { removeProvider, updateProvider } from "@/lib/assistant/models/store";

type Context = { params: Promise<{ id: string }> };

const GONE = "That provider is not saved any more.";

/** The id, or a refusal (anything not a provider id). */
async function idOf(ctx: Context): Promise<{ ok: true; id: string } | { ok: false; response: NextResponse }> {
  const { id } = await ctx.params;
  if (!isProviderId(id)) return { ok: false, response: fail("That is not a provider id.", 400) };
  return { ok: true, id };
}

export async function PATCH(request: Request, ctx: Context) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;
  const id = await idOf(ctx);
  if (!id.ok) return id.response;
  const body = await readBody(request, UpdateProviderSchema, "Send { name?, preset?, baseUrl?, models?, apiKey? or removeKey? } only.");
  if (!body.ok) return body.response;
  try {
    const provider = await updateProvider(id.id, body.value);
    if (!provider) return fail(GONE, 404);
    return NextResponse.json({ provider, ...(await modelsView()) }, { headers: NO_STORE });
  } catch (error) {
    return trouble(error);
  }
}

export async function DELETE(request: Request, ctx: Context) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;
  const id = await idOf(ctx);
  if (!id.ok) return id.response;
  try {
    if (!(await removeProvider(id.id))) return fail(GONE, 404);
    return NextResponse.json(await modelsView(), { headers: NO_STORE });
  } catch (error) {
    return trouble(error);
  }
}
