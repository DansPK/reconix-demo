/* The saved models, as the dashboard's server keeps them in models.json in the assistant's
   folder (models/store.ts): the providers (a name, a preset, an OpenAI-compatible base URL, the
   model names and, when there is one, the API key sealed with AES-256-GCM: models/crypto.ts)
   and the active choice. The field rules here are shared by the file, the routes' bodies
   (requests.ts) and what the browser gets back (view.ts). Pure: browser and server. */
import { z } from "zod";

import { PRESET_IDS } from "./presets";

export const MODELS_FORMAT = "reconix.assistant.models/v1";
export const MAX_PROVIDERS = 20;
export const MAX_MODELS = 50; // model names per provider
export const MAX_NAME = 60; // a provider's name
export const MAX_URL = 2_048;
export const MAX_KEY = 4_096;
const MAX_MODEL_NAME = 128;
const MAX_SEALED = 8_000; // a sealed key's base64 ciphertext (a 4 096-byte key takes 5 464)

/** A model name: the characters model ids use (llama3.2, openai/gpt-4o-mini, qwen:7b@q4). */
export const MODEL_NAME = /^[\w.:/@+-]{1,128}$/;

/** The most one saved provider takes in models.json, every field at the schema's maximum: a
    character of the name or the address at its widest in JSON (\uXXXX: 6 bytes), each model
    name with its quotes and comma, the sealed key, and 400 bytes for the keys and punctuation. */
export const MAX_PROVIDER_BYTES = 36 + 6 * MAX_NAME + 16 + 6 * MAX_URL + MAX_MODELS * (MAX_MODEL_NAME + 3) + (24 + 32 + MAX_SEALED) + 400;
/** models.json's size limit: MAX_PROVIDERS providers at their largest, with room to spare (the
    store refuses a change that would pass it, so the file always stays readable). */
export const MAX_FILE_BYTES = MAX_PROVIDERS * MAX_PROVIDER_BYTES + 16_384;
/** A provider's id: a random (v4) UUID, lower case. */
export const PROVIDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** An API key: printable ASCII without spaces (it goes into an Authorization header). */
export const API_KEY = /^[\x21-\x7e]{1,4096}$/;

export const isProviderId = (value: unknown): value is string => typeof value === "string" && PROVIDER_ID.test(value);

export const ModelNameSchema = z.string().regex(MODEL_NAME);
export const ModelListSchema = z
  .array(ModelNameSchema)
  .min(1)
  .max(MAX_MODELS)
  .refine((list) => new Set(list).size === list.length, "Each model is listed once.");
export const PresetSchema = z.enum(PRESET_IDS);
export const ProviderIdSchema = z.string().regex(PROVIDER_ID);

const Base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);
/** A sealed API key: the random IV (12 bytes), the GCM tag (16 bytes) and the ciphertext. */
export const SealedSchema = z.object({ iv: Base64.max(24), tag: Base64.max(32), data: Base64.max(8_000) }).strict();
export type Sealed = z.infer<typeof SealedSchema>;

export const SavedProviderSchema = z
  .object({
    id: ProviderIdSchema,
    name: z.string().min(1).max(MAX_NAME),
    preset: PresetSchema,
    baseUrl: z.string().min(1).max(MAX_URL),
    models: ModelListSchema,
    key: SealedSchema.optional(),
  })
  .strict();
export type SavedProvider = z.infer<typeof SavedProviderSchema>;

export const ActiveSchema = z.object({ providerId: ProviderIdSchema, model: ModelNameSchema }).strict();
export type Active = z.infer<typeof ActiveSchema>;

export const ModelsFileSchema = z
  .object({
    format: z.literal(MODELS_FORMAT),
    providers: z.array(SavedProviderSchema).max(MAX_PROVIDERS),
    active: ActiveSchema.nullable(),
  })
  .strict();
export type ModelsFile = z.infer<typeof ModelsFileSchema>;

export const EMPTY_MODELS: ModelsFile = { format: MODELS_FORMAT, providers: [], active: null };
