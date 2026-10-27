/* The saved models' size guard (lib/assistant/models/store.ts `change`): a change that would make
   models.json bigger than it may be read back is refused with a 400 and a fixed message, before
   anything is written, so the file (and every key in it) stays readable. With the real limits
   the schema's own maximums always fit (models-store.test.ts); here the limit is made small so
   the guard itself is reached. The saved models go to a temporary folder. */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE, sessionValue } from "@/lib/auth/session";

const LIMIT = 24_000;
vi.mock("@/lib/assistant/models/schema", async (load) => ({ ...(await load<typeof import("@/lib/assistant/models/schema")>()), MAX_FILE_BYTES: LIMIT }));

const TOKEN = "models-size-test-token-0123456789";
let cookie = "";
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === COOKIE && cookie ? { value: cookie } : undefined) }) }));
vi.mock("next/server", async (load) => ({ ...(await load<typeof import("next/server")>()), connection: async () => undefined }));
vi.mock("@/lib/auth/guard", () => ({ requireSignedIn: async () => undefined }));

const { MODELS_FAIL } = await import("@/lib/assistant/models/errors");
const { activeModel } = await import("@/lib/assistant/models/resolve");
const { addProvider, readSaved, updateProvider } = await import("@/lib/assistant/models/store");
const models = await import("@/app/api/assistant/models/route");

const SECRET = "sk-size-test-0123456789abcdef";
const saved = { ...process.env };
let dir = "";
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "reconix-models-size-"));
  process.env = { ...saved, RECONIX_WEB_TOKEN: TOKEN, RECONIX_ASSISTANT_DIR: dir };
  cookie = sessionValue(TOKEN);
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(dir, { recursive: true, force: true });
});

/** A provider of about 3.5 KB in the file (50 model names and a sealed key); the first one is
    made the model that answers. */
const bulky = (i: number) => ({
  name: `Provider ${i}`,
  preset: "custom" as const,
  baseUrl: "http://127.0.0.1:11434/v1",
  models: Array.from({ length: 50 }, (_, m) => `model-${i}-${m}-`.padEnd(64, "x")),
  apiKey: SECRET,
  ...(i === 0 ? { activate: true } : {}),
});
const file = () => path.join(dir, "models.json");

describe("a change that would make models.json too big", () => {
  it("is refused with a 400 and a fixed message, and the file stays readable", async () => {
    const added: string[] = [];
    let refusal: unknown = null;
    for (let i = 0; i < 20 && !refusal; i += 1) {
      try {
        added.push((await addProvider(bulky(i))).id);
      } catch (error) {
        refusal = error;
      }
    }
    expect(added.length).toBeGreaterThan(1);
    expect(refusal).toMatchObject({ message: MODELS_FAIL.full, status: 400 });
    expect(MODELS_FAIL.full).toBe("Too many saved models: remove one first.");
    const before = readFileSync(file(), "utf8");
    expect(statSync(file()).size).toBeLessThanOrEqual(LIMIT);

    // nothing was written: every provider and key still reads, and the chosen model still answers
    const { file: kept, apiKeyOf } = await readSaved();
    expect(kept.providers.map((p) => p.id)).toEqual(added);
    expect(apiKeyOf(kept.providers[0])).toBe(SECRET);
    expect((await activeModel()).ok).toBe(true);

    // a change that grows an existing provider past the limit (by more than any provider
    // takes, so past whatever room is left) is refused the same way
    const longer = { baseUrl: `http://127.0.0.1:11434/${"v".repeat(2_000)}`, models: Array.from({ length: 50 }, (_, m) => `grown-${m}-`.padEnd(128, "y")) };
    const grow = updateProvider(added[0], longer);
    await expect(grow).rejects.toMatchObject({ message: MODELS_FAIL.full, status: 400 });
    expect(readFileSync(file(), "utf8")).toBe(before);
    expect(readdirSync(dir).filter((n) => n.endsWith(".tmp"))).toEqual([]); // no temporary file left
  });

  it("is answered 400 by the route, and the list still loads", async () => {
    const ORIGIN = "http://127.0.0.1:3100";
    const post = (body: unknown) =>
      models.POST(
        new Request(`${ORIGIN}/api/assistant/models`, {
          method: "POST",
          headers: { host: "127.0.0.1:3100", origin: ORIGIN, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    let last: Response | null = null;
    for (let i = 0; i < 20; i += 1) {
      last = await post(bulky(i));
      if (last.status !== 201) break;
    }
    expect(last?.status).toBe(400);
    expect(await last?.json()).toEqual({ detail: MODELS_FAIL.full });
    const listed = await models.GET(new Request(`${ORIGIN}/api/assistant/models`, { headers: { host: "127.0.0.1:3100" } }));
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { providers: unknown[]; summary: { configured: boolean } };
    expect(body.providers.length).toBeGreaterThan(1);
    expect(body.summary.configured).toBe(true);
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });
});
