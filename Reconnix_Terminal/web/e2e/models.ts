/* The e2e server's AI model (the web reads none from its environment): the stand-in
   (e2e/llm-stub.mjs) saved as a provider "Stub" (Custom, its address, stub-model) and made
   active, through the dashboard's own route with a signed-in session's cookies, so models.json is
   written by the real store in its own format. e2e/global-setup.ts seeds it before any spec;
   a spec that changes the models (or needs none: `clearModels`) puts it back with `seedModels`. */
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { APIRequestContext } from "@playwright/test";

import { LLM_PORT, PORT } from "../playwright.config";

/** The e2e server's assistant folder (playwright.config.ts RECONIX_ASSISTANT_DIR). */
export const ASSISTANT_DIR = path.join(tmpdir(), `reconix-e2e-assistant-${PORT}`);
export const STUB_URL = `http://127.0.0.1:${LLM_PORT}/v1`;
export const STUB = { name: "Stub", preset: "custom", baseUrl: STUB_URL, models: ["stub-model"], activate: true } as const;

/** No saved model at all (the folder outlives a run; the conversations are left alone). */
export function clearModels() {
  for (const name of ["models.json", "models.key"]) rmSync(path.join(ASSISTANT_DIR, name), { force: true });
}

/** Only the stand-in, saved and active, as + Model saves it. `api` is signed in. */
export async function seedModels(api: APIRequestContext) {
  clearModels();
  const origin = `http://127.0.0.1:${PORT}`;
  const res = await api.post("/api/assistant/models", { data: STUB, headers: { Origin: origin } });
  if (res.status() !== 201) throw new Error(`seeding the stand-in model failed: ${res.status()} ${await res.text()}`);
}
