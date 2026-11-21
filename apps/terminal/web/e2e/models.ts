/* The e2e server's AI model: the stand-in (e2e/llm-stub.mjs) added as a provider "Stub" (Custom,
   its address, stub-model) and made active, through the dashboard's own route with a signed-in
   session's cookies, so it reaches the stand-in Core API (e2e/core-api-stub.mjs) as + Model
   saves it. e2e/global-setup.ts seeds it before any spec; a spec that changes the models (or
   needs none: `clearModels`) puts it back with `seedModels`. */
import type { APIRequestContext } from "@playwright/test";

import { CORE_API_PORT, LLM_PORT, PORT } from "../playwright.config";

export const STUB_URL = `http://127.0.0.1:${LLM_PORT}/v1`;
export const STUB = { name: "Stub", preset: "custom", baseUrl: STUB_URL, models: ["stub-model"], activate: true } as const;

/** No provider at all on the stand-in Core API. */
export async function clearModels() {
  const res = await fetch(`http://127.0.0.1:${CORE_API_PORT}/__e2e/reset-providers`, { method: "POST" });
  if (!res.ok) throw new Error(`clearing the models failed: ${res.status}`);
}

/** Only the stand-in, saved and active, as + Model saves it. `api` is signed in. */
export async function seedModels(api: APIRequestContext) {
  await clearModels();
  const origin = `http://127.0.0.1:${PORT}`;
  const res = await api.post("/api/assistant/models", { data: STUB, headers: { Origin: origin } });
  if (res.status() !== 201) throw new Error(`seeding the stand-in model failed: ${res.status()} ${await res.text()}`);
}
