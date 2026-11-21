/* Sign in once and save the local session cookie for browser tests. */
import { request } from "@playwright/test";

import { PORT, STATE_FILE, TOKEN } from "./../playwright.config";

export default async function globalSetup() {
  const origin = `http://127.0.0.1:${PORT}`;
  const api = await request.newContext({ baseURL: origin });
  const res = await api.post("/api/session", { data: { token: TOKEN }, headers: { Origin: origin } });
  if (!res.ok()) throw new Error(`global sign-in failed: ${res.status()} ${await res.text()}`);
  await api.storageState({ path: STATE_FILE });
  await api.dispose();
}
