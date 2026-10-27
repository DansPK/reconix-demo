/* What the model picker's routes answer (and the page tells the assistant): the saved providers
   without their keys (only whether one is saved), the active choice and a summary of the model
   that answers next. Never an API key. Pure: browser and server (the browser checks every
   answer against these before it uses it). */
import { z } from "zod";

import { MAX_MODELS, MAX_NAME, MAX_PROVIDERS, MAX_URL, ModelNameSchema, PresetSchema, ProviderIdSchema } from "./schema";

/** The model that answers next, in words the page can show. `name` is the chosen model even
    when it can't be used (`configured` false, `reason` says why); empty when nothing is chosen. */
export const ModelSummarySchema = z
  .object({
    configured: z.boolean(),
    name: z.string().max(128),
    provider: z.string().max(MAX_NAME),
    local: z.boolean(),
    reason: z.string().max(600),
  })
  .strict();
export type ModelSummary = z.infer<typeof ModelSummarySchema>;

export const ProviderViewSchema = z
  .object({
    id: ProviderIdSchema,
    name: z.string().max(MAX_NAME),
    preset: PresetSchema,
    baseUrl: z.string().max(MAX_URL),
    models: z.array(ModelNameSchema).max(MAX_MODELS),
    keySaved: z.boolean(),
    local: z.boolean(),
  })
  .strict();
export type ProviderView = z.infer<typeof ProviderViewSchema>;

export const ActiveViewSchema = z.object({ providerId: ProviderIdSchema, model: ModelNameSchema }).strict();
export type ActiveView = z.infer<typeof ActiveViewSchema>;

export const ModelsViewSchema = z
  .object({
    providers: z.array(ProviderViewSchema).max(MAX_PROVIDERS),
    active: ActiveViewSchema.nullable(),
    summary: ModelSummarySchema,
  })
  .strict();
export type ModelsView = z.infer<typeof ModelsViewSchema>;

/** The answer of "Test connection". */
export const ProbeResultSchema = z.object({ ok: z.boolean(), detail: z.string().max(400) }).strict();
export type ProbeResult = z.infer<typeof ProbeResultSchema>;

/** The answer of "Fetch models": the names the model's server lists (the server keeps at most
    200), or `listed: false` with why when it answered without a list that could be read (the
    picker may then test a model it knows of, or have one typed). Any other failure is an error
    status. */
export const FetchResultSchema = z.union([
  z.object({ models: z.array(ModelNameSchema).max(200) }).strict(),
  z.object({ listed: z.literal(false), detail: z.string().max(400) }).strict(),
]);
export type FetchResult = z.infer<typeof FetchResultSchema>;
