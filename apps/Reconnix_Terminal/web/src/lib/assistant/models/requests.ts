/* What the browser may send to the model picker's routes (/api/assistant/models…), checked on the
   server before anything is read: strict shapes, so an unknown field is refused. The server
   cleans and checks the values again (models/store.ts, config.ts); these only bound them.
   Pure: browser and server. */
import { z } from "zod";

import { API_KEY, MAX_URL, ModelListSchema, ModelNameSchema, PresetSchema, ProviderIdSchema } from "./schema";

export const MAX_MODELS_BODY = 24_000; // bytes of one request

const Name = z.string().max(400); // cleaned to MAX_NAME by the store
const BaseUrl = z.string().trim().min(1).max(MAX_URL);
const ApiKey = z.string().trim().regex(API_KEY);

/** POST /api/assistant/models: a new provider; `activate` makes its first model the active one. */
export const AddProviderSchema = z
  .object({ name: Name, preset: PresetSchema, baseUrl: BaseUrl, models: ModelListSchema, apiKey: ApiKey.optional(), activate: z.boolean().optional() })
  .strict();
export type AddProvider = z.infer<typeof AddProviderSchema>;

/** PATCH /api/assistant/models/<id>: what changes. No `apiKey` keeps the saved key; `removeKey`
    deletes it (not both). */
export const UpdateProviderSchema = z
  .object({ name: Name.optional(), preset: PresetSchema.optional(), baseUrl: BaseUrl.optional(), models: ModelListSchema.optional(), apiKey: ApiKey.optional(), removeKey: z.literal(true).optional() })
  .strict()
  .refine((body) => !(body.apiKey && body.removeKey), "Send a new key or remove it, not both.");
export type UpdateProvider = z.infer<typeof UpdateProviderSchema>;

/** PUT /api/assistant/models/active: the model that answers next (a saved provider's). */
export const SetActiveSchema = z.object({ providerId: ProviderIdSchema, model: ModelNameSchema }).strict();
export type SetActive = z.infer<typeof SetActiveSchema>;

/** POST /api/assistant/models/test and …/fetch: a saved provider as it is saved, or unsaved
    values from the form. A saved key is only ever sent to its saved address. */
export const ProbeSchema = z.union([
  z.object({ providerId: ProviderIdSchema, model: ModelNameSchema.optional() }).strict(),
  z.object({ baseUrl: BaseUrl, model: ModelNameSchema.optional(), apiKey: ApiKey.optional() }).strict(),
]);
export type Probe = z.infer<typeof ProbeSchema>;
