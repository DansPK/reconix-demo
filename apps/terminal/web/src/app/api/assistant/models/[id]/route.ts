/* One provider of the AI Assistant's models (signed in; src/proxy.ts checks the session too).
   Static demo: the built-in Reconix provider is fixed, so changing or removing a provider is
   inert (409 with a sentence); nothing is saved or removed anywhere. Both need the page's own
   Origin; the id must be a provider id (a random UUID) before anything is read. */
import { fail, refuse } from "@/lib/assistant/access";
import { UpdateProviderSchema } from "@/lib/assistant/models/requests";
import { readBody } from "@/lib/assistant/models/respond";
import { isProviderId } from "@/lib/assistant/models/schema";

type Context = { params: Promise<{ id: string }> };

async function idOf(ctx: Context): Promise<string | null> {
  const { id } = await ctx.params;
  return isProviderId(id) ? id : null;
}

export async function PATCH(request: Request, ctx: Context) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;
  const id = await idOf(ctx);
  if (!id) return fail("That is not a provider id.", 400);
  const body = await readBody(request, UpdateProviderSchema, "Send { name?, preset?, baseUrl?, models?, apiKey? or removeKey? } only.");
  if (!body.ok) return body.response;
  return fail("This demo answers with its built-in Reconix model; changing providers is disabled.", 409);
}

export async function DELETE(request: Request, ctx: Context) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;
  const id = await idOf(ctx);
  if (!id) return fail("That is not a provider id.", 400);
  return fail("This demo answers with its built-in Reconix model; removing providers is disabled.", 409);
}
