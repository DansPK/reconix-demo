/* Signs in once and saves the cookies (both httpOnly ones) where every spec starts from, so a
   test doesn't spend a page load on the sign-in link. access.spec.ts starts from nothing. Then
   saves the stand-in model as the AI Assistant's only model (e2e/models.ts): the web reads no
   model from its environment. */
import { request } from "@playwright/test";

import { PORT, STATE_FILE, TOKEN } from "./../playwright.config";
import { seedModels } from "./models";

export default async function globalSetup() {
  const origin = `http://127.0.0.1:${PORT}`;
  const api = await request.newContext({ baseURL: origin });
  const res = await api.post("/api/session", { data: { token: TOKEN }, headers: { Origin: origin } });
  if (!res.ok()) throw new Error(`global sign-in failed: ${res.status()} ${await res.text()}`);
  await api.storageState({ path: STATE_FILE });
  await seedModels(api);
  await api.dispose();
}
