/* The model picker's routes called directly (e2e/access.spec.ts and e2e/assistant.spec.ts go
   through the proxy too): a session, and the page's Origin on every change, strict
   bodies within a byte cap, remote addresses allowed by default (a Groq provider at its real
   address, its requests sent to the stand-in, end to end), a cloud preset only at its own address, an API key that never comes back in any answer, "Test connection"
   and "Fetch models" against a stand-in model server (a server that answers without a list said
   apart from one that can't be asked, and a redirect, which is refused), a switch that the
   next question uses, and no model from the environment: LLM_BASE_URL / LLM_MODEL /
   LLM_API_KEY are set here and never read, and "environment" is no provider any route takes.
   The saved models go to a temporary folder. */
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MODELS_FAIL } from "@/lib/assistant/models/errors";
import { chipState } from "@/components/assistant/model-picker-rules";
import { CLOUD_FIXED, presetOf } from "@/lib/assistant/models/presets";
import { NO_MODEL } from "@/lib/assistant/models/resolve";
import { COOKIE, sessionValue } from "@/lib/auth/session";

const TOKEN = "models-route-test-token-0123456789";
const SECRET = "sk-route-secret-0123456789abcdef";
let cookie = "";
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === COOKIE && cookie ? { value: cookie } : undefined) }) }));
vi.mock("next/server", async (load) => ({ ...(await load<typeof import("next/server")>()), connection: async () => undefined }));
vi.mock("@/lib/auth/guard", () => ({ requireSignedIn: async () => undefined }));

const models = await import("@/app/api/assistant/models/route");
const one = await import("@/app/api/assistant/models/[id]/route");
const active = await import("@/app/api/assistant/models/active/route");
const probe = await import("@/app/api/assistant/models/test/route");
const fetchRoute = await import("@/app/api/assistant/models/fetch/route");
const question = await import("@/app/api/assistant/route");

// --- a stand-in model server: it records what it was sent ------------------------------------------
type Seen = { method: string; url: string; auth: string; model?: string };
let seen: Seen[] = [];
let server: Server;
let base = "";
beforeAll(async () => {
  server = createServer((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = req.url ?? "";
      const model = body ? (JSON.parse(body) as { model?: string }).model : undefined;
      seen.push({ method: req.method ?? "", url, auth: String(req.headers.authorization ?? ""), model });
      if (url.startsWith("/moved/")) return res.writeHead(302, { Location: `${base}/models` }).end();
      if (url.startsWith("/locked/") && req.headers.authorization !== `Bearer ${SECRET}`) return res.writeHead(401).end("{}");
      // a GET {base}/models that is no list: none at all, an error, not JSON, another shape
      if (url === "/nolist/v1/models") return res.writeHead(404).end();
      if (url === "/broken/v1/models") return res.writeHead(500).end("{}");
      if (url === "/garbled/v1/models") return res.writeHead(200, { "Content-Type": "text/html" }).end("<html>models</html>");
      if (url === "/shape/v1/models") return res.writeHead(200, { "Content-Type": "application/json" }).end('{"models":["a"]}');
      // …and one that may not be had: a refused key, the limit, a list past 1 MB
      if (url === "/forbidden/v1/models") return res.writeHead(403).end("{}");
      if (url === "/busy/v1/models") return res.writeHead(429).end("{}");
      if (url === "/huge/v1/models") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ data: [{ id: "x".repeat(1_100_000) }] }));
      }
      if (url.endsWith("/models") && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ object: "list", data: [{ id: "stub-b" }, { id: "stub-a" }, { id: "bad name" }, { id: 7 }, { id: "stub-a" }] }));
      }
      if (url.endsWith("/chat/completions") && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `Answered by ${model}.` } }] })}\n\n`);
        return res.end("data: [DONE]\n\n");
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));

const saved = { ...process.env };
let dir = "";
let clock = Date.now();
const bodies: string[] = []; // every answer, to look for the key in
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime((clock += 120_000)); // a new minute for the rate limits
  dir = mkdtempSync(path.join(tmpdir(), "reconix-models-route-"));
  process.env = { ...saved, RECONIX_WEB_TOKEN: TOKEN, RECONIX_DATA_DIR: "sample-data", RECONIX_STALE_AFTER_HOURS: "0", RECONIX_ASSISTANT_DIR: dir };
  // what used to name the web's model: set, and never read any more
  process.env.LLM_BASE_URL = `${base}/v1`;
  process.env.LLM_MODEL = "env-model";
  process.env.LLM_API_KEY = "sk-env-key-never-read";
  cookie = sessionValue(TOKEN);
  seen = [];
});
afterEach(() => {
  vi.useRealTimers();
  process.env = { ...saved };
  rmSync(dir, { recursive: true, force: true });
});
afterAll(() => {
  // the key went in, and never came back out of any route
  expect(bodies.length).toBeGreaterThan(20);
  for (const text of bodies) expect(text).not.toContain(SECRET);
});

const ORIGIN = "http://127.0.0.1:3100";
const request = (url: string, init: RequestInit & { origin?: string | null } = {}) => {
  const headers: Record<string, string> = { host: "127.0.0.1:3100", "content-type": "application/json" };
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  return new Request(`http://127.0.0.1:3100${url}`, { ...init, headers });
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
async function read(res: Response | Promise<Response>) {
  const r = await res;
  const text = await r.text();
  bodies.push(text);
  return { status: r.status, body: JSON.parse(text || "null") as Record<string, unknown> & { detail?: string } };
}
const json = (method: string, url: string, body: unknown, origin?: string) => request(url, { method, body: JSON.stringify(body), origin });

const list = () => read(models.GET(request("/api/assistant/models", { origin: null })));
const add = (body: unknown, origin?: string) => read(models.POST(json("POST", "/api/assistant/models", body, origin)));
const patch = (id: string, body: unknown, origin?: string) => read(one.PATCH(json("PATCH", `/api/assistant/models/${id}`, body, origin), ctx(id)));
const remove = (id: string, origin?: string) => read(one.DELETE(request(`/api/assistant/models/${id}`, { method: "DELETE", origin }), ctx(id)));
const choose = (body: unknown, origin?: string) => read(active.PUT(json("PUT", "/api/assistant/models/active", body, origin)));
const test = (body: unknown, origin?: string) => read(probe.POST(json("POST", "/api/assistant/models/test", body, origin)));
const fetchNames = (body: unknown, origin?: string) => read(fetchRoute.POST(json("POST", "/api/assistant/models/fetch", body, origin)));

const provider = (over: Record<string, unknown> = {}) => ({ name: "Stand-in", preset: "custom", baseUrl: `${base}/v1`, models: ["stub-a", "stub-b"], apiKey: SECRET, ...over });
const ID = "0b0e2d55-1c5a-4b1e-9b8c-2f1d3c4b5a69";

describe("the locks", () => {
  it("refuse a missing session and an old role-prefixed cookie, on reads and changes", async () => {
    for (const who of ["", `operator.${sessionValue(TOKEN)}`]) {
      cookie = who;
      expect((await list()).status).toBe(401);
      expect((await add(provider())).status).toBe(401);
      expect((await choose({ providerId: "environment", model: "env-model" })).status).toBe(401);
      expect((await test({ providerId: "environment" })).status).toBe(401);
    }
  });
  it("want the page's own Origin on every change", async () => {
    const evil = "http://evil.example";
    expect((await add(provider(), evil)).status).toBe(403);
    expect((await patch(ID, { name: "x" }, evil)).status).toBe(403);
    expect((await remove(ID, evil)).status).toBe(403);
    expect((await choose({ providerId: "environment", model: "env-model" }, evil)).status).toBe(403);
    expect((await test({ providerId: "environment" }, evil)).status).toBe(403);
    expect((await fetchNames({ providerId: "environment" }, evil)).status).toBe(403);
    expect(seen).toHaveLength(0);
    expect((await list()).status).toBe(200); // a read needs none
  });
  it("check the body before anything is read or sent", async () => {
    expect((await add({ ...provider(), extra: 1 })).status).toBe(400);
    expect((await add(provider({ models: ["bad name"] }))).status).toBe(400);
    expect((await add(provider({ models: [] }))).status).toBe(400);
    expect((await add(provider({ models: ["a", "a"] }))).status).toBe(400);
    expect((await add(provider({ preset: "skynet" }))).status).toBe(400);
    expect((await add(provider({ apiKey: "two words" }))).status).toBe(400);
    expect((await add(provider({ apiKey: "line\r\nX-Injected: 1" }))).status).toBe(400);
    expect((await add({ ...provider(), pad: "y".repeat(30_000) })).status).toBe(413);
    expect((await patch("not-an-id", { name: "x" })).status).toBe(400);
    expect((await patch(ID, { apiKey: "k", removeKey: true })).status).toBe(400);
    expect((await remove("../models.key")).status).toBe(400);
    expect((await choose({ providerId: ID, model: "m", more: 1 })).status).toBe(400);
    expect((await test({ baseUrl: `${base}/v1` })).body.detail).toBe("Name a model to test.");
    expect((await test({ providerId: ID, baseUrl: base })).status).toBe(400);
    expect(seen).toHaveLength(0);
  });
  it("refuse the old Environment provider everywhere, before anything is read or sent", async () => {
    const env = { providerId: "environment", model: "env-model" };
    const chosen = await choose(env);
    expect(chosen).toEqual({ status: 400, body: { detail: "Send { providerId, model } only: a saved provider's id and one of its models." } });
    expect((await test({ providerId: "environment" })).status).toBe(400);
    expect((await fetchNames({ providerId: "environment" })).status).toBe(400);
    expect((await patch("environment", { name: "x" })).body).toEqual({ detail: "That is not a provider id." });
    expect((await remove("environment")).status).toBe(400);
    expect(seen).toHaveLength(0); // the environment's address was never asked
    expect((await list()).body.active).toBeNull();
  });
});

describe("the providers", () => {
  it("list nothing before anything is saved, whatever the environment names", async () => {
    const { status, body } = await list();
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["active", "presets", "providers", "summary"]);
    expect(body).toMatchObject({
      providers: [],
      active: null,
      summary: { configured: false, name: "", provider: "", local: false, reason: NO_MODEL },
    });
    for (const env of ["env-model", "sk-env-key", base]) expect(JSON.stringify(body)).not.toContain(env); // nothing of LLM_*
    // the model picker's rows, in its order, each saying what it needs: a key, and whether its
    // address is a fixed cloud one (usable by default: the data goes there), local or any
    const presets = body.presets as { id: string; key: string; kind: string; baseUrl: string }[];
    expect(presets.map((p) => [p.id, p.key, p.kind])).toEqual([
      ["openai", "required", "cloud"],
      ["anthropic", "required", "cloud"],
      ["deepseek", "required", "cloud"],
      ["openrouter", "required", "cloud"],
      ["groq", "required", "cloud"],
      ["ollama", "none", "local"],
      ["lmstudio", "none", "local"],
      ["custom", "optional", "custom"],
    ]);
    for (const p of presets) {
      if (p.kind === "cloud") expect(p.baseUrl).toMatch(/^https:\/\//);
      if (p.kind === "local") expect(p.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    }
  });
  it("allow the cloud presets by default (no server switch), whatever LLM_ALLOW_REMOTE says", async () => {
    process.env.LLM_ALLOW_REMOTE = "0"; // the old switch: not read any more
    const cloud = { name: "OpenAI", preset: "openai", baseUrl: "https://api.openai.com/v1", models: ["gpt-4o-mini"], apiKey: SECRET };
    const added = await add({ ...cloud, activate: true });
    expect(added.status).toBe(201);
    expect(added.body.summary).toMatchObject({ configured: true, name: "gpt-4o-mini", provider: "OpenAI", local: false });
  });
  it("add, change and remove one, the key never coming back", async () => {
    const added = await add(provider({ activate: true }));
    expect(added.status).toBe(201);
    const p = added.body.provider as { id: string; keySaved: boolean };
    expect(p.keySaved).toBe(true);
    expect(added.body.active).toEqual({ providerId: p.id, model: "stub-a" });
    expect(added.body.summary).toMatchObject({ configured: true, name: "stub-a", provider: "Stand-in" });

    const renamed = await patch(p.id, { name: "Renamed", models: ["stub-b"] });
    expect(renamed.status).toBe(200);
    expect(renamed.body.provider).toMatchObject({ name: "Renamed", models: ["stub-b"], keySaved: true });
    expect(renamed.body.active).toEqual({ providerId: p.id, model: "stub-b" }); // its first model now
    expect((await patch(p.id, { removeKey: true })).body.provider).toMatchObject({ keySaved: false });

    const gone = await remove(p.id);
    expect(gone.status).toBe(200);
    expect(gone.body.providers).toEqual([]);
    expect(gone.body.active).toBeNull(); // nothing answers in its place
    expect(gone.body.summary).toMatchObject({ configured: false, reason: NO_MODEL });
    expect((await remove(p.id)).status).toBe(404);
    expect((await patch(p.id, { name: "x" })).status).toBe(404);
  });
  it("take an address off this machine, a key only over https and never in the address", async () => {
    expect((await add(provider({ baseUrl: "http://api.openai.com/v1", preset: "openai" }))).body.detail).toContain("only sent over https");
    expect((await test({ baseUrl: "http://llm.example.com/v1", model: "m", apiKey: SECRET })).body.detail).toContain("only sent over https");
    expect((await fetchNames({ baseUrl: "https://u:p@llm.example.com/v1" })).body.detail).toContain("not in the base URL");
    expect((await add(provider({ baseUrl: "https://api.openai.com/v1", preset: "openai" }))).status).toBe(201);
    expect(seen).toHaveLength(0); // nothing was sent anywhere
  });
  it("tie a cloud preset to its own address: another one is refused, Custom takes it", async () => {
    const crafted = { name: "OpenAI", preset: "openai", baseUrl: "https://other.example/v1", models: ["gpt-4o-mini"], apiKey: SECRET };
    for (const baseUrl of ["https://other.example/v1", "https://api.openai.com.other.example/v1", "https://api.openai.com:8443/v1"]) {
      const refused = await add({ ...crafted, baseUrl });
      expect(refused).toEqual({ status: 400, body: { detail: CLOUD_FIXED } });
    }
    expect(CLOUD_FIXED).toBe("A cloud provider's address is fixed; use Custom for another address.");
    expect((await list()).body.providers).toEqual([]); // nothing saved
    const real = await add({ ...crafted, baseUrl: "https://api.openai.com/v1" });
    expect(real.status).toBe(201);
    const id = (real.body.provider as { id: string }).id;
    expect((await add({ ...crafted, name: "Elsewhere", preset: "custom" })).status).toBe(201); // Custom: any address

    // a change of the address or the preset is checked the same way
    expect((await patch(id, { baseUrl: "https://other.example/v1", apiKey: "new-key" })).body.detail).toBe(CLOUD_FIXED);
    const local = (await add(provider({ name: "Local" }))).body.provider as { id: string };
    expect((await patch(local.id, { preset: "anthropic" })).body.detail).toBe(CLOUD_FIXED);
    const moved = await patch(id, { preset: "custom", baseUrl: "https://other.example/v1", apiKey: "new-key" });
    expect(moved.status).toBe(200);
    expect(moved.body.provider).toMatchObject({ preset: "custom", baseUrl: "https://other.example/v1", keySaved: true });
    expect((await patch(id, { preset: "openai" })).body.detail).toBe(CLOUD_FIXED);
    expect((await patch(id, { preset: "openai", baseUrl: "https://api.openai.com/v1", apiKey: SECRET })).status).toBe(200);
    expect(seen).toHaveLength(0);
  });
  it("leave a cloud preset saved at another address before that rule working until its preset or address changes", async () => {
    const older = { id: ID, name: "OpenAI", preset: "openai", baseUrl: "https://llm.other.example/v1", models: ["gpt-4o-mini"] };
    writeFileSync(path.join(dir, "models.json"), JSON.stringify({ format: "reconix.assistant.models/v1", providers: [older], active: null }), { mode: 0o600 });
    expect((await list()).body.providers).toEqual([expect.objectContaining({ preset: "openai", baseUrl: older.baseUrl })]);
    expect((await patch(ID, { models: ["gpt-4o-mini", "gpt-4o"] })).status).toBe(200);
    expect((await choose({ providerId: ID, model: "gpt-4o" })).status).toBe(200);
    expect((await patch(ID, { baseUrl: "https://llm.other.example/v2" })).body.detail).toBe(CLOUD_FIXED);
    expect((await patch(ID, { preset: "custom" })).body.provider).toMatchObject({ preset: "custom", baseUrl: older.baseUrl }); // what the picker sends
  });
  it("say clearly when an address grows too long, or models.key is open to other users", async () => {
    const long = await add(provider({ baseUrl: `${base}/${"é".repeat(400)}` })); // %-encoded: 6 times as long
    expect(long.status).toBe(400);
    expect(long.body.detail).toMatch(/^The base URL is too long/);
    expect((await test({ baseUrl: `${base}/${"é".repeat(400)}`, model: "m" })).status).toBe(400);
    if (process.platform === "win32") return;
    expect((await add(provider({ activate: true }))).status).toBe(201);
    chmodSync(path.join(dir, "models.key"), 0o644);
    const listed = await list();
    expect(listed.status).toBe(500);
    expect(listed.body.detail).toBe(MODELS_FAIL.keyShared);
    const asked = await question.POST(json("POST", "/api/assistant", { uid: null, question: "hi" }));
    expect(asked.status).toBe(503);
    expect(((await asked.json()) as { detail: string }).detail).toBe(MODELS_FAIL.keyShared);
    expect(statSync(path.join(dir, "models.key")).mode & 0o777).toBe(0o644); // never quietly fixed
    expect(seen).toHaveLength(0);
  });
});

describe("test and fetch", () => {
  it("test a saved provider (its key to its own address) and unsaved values", async () => {
    const p = (await add(provider({ baseUrl: `${base}/locked/v1` }))).body.provider as { id: string };
    const ok = await test({ providerId: p.id, model: "stub-b" });
    expect(ok.body).toEqual({ ok: true, detail: "Connected: stub-b answered." });
    expect(seen.at(-1)).toMatchObject({ method: "POST", url: "/locked/v1/chat/completions", auth: `Bearer ${SECRET}`, model: "stub-b" });
    const unsaved = await test({ baseUrl: `${base}/locked/v1`, model: "stub-a" }); // no key typed: none sent
    expect(unsaved.body).toMatchObject({ ok: false });
    expect(unsaved.body.detail).toContain("HTTP 401: check the API key");
    expect(seen.at(-1)?.auth).toBe("");
    const down = await test({ baseUrl: "http://127.0.0.1:9/v1", model: "m" });
    expect(down.body).toEqual({ ok: false, detail: "Could not reach the address. Is the model's server running?" });
    expect(JSON.stringify(down.body)).not.toContain("127.0.0.1:9");
  });
  it("fetch the model names: sorted, once each, only names a model may have", async () => {
    const names = await fetchNames({ baseUrl: `${base}/v1` });
    expect(names).toEqual({ status: 200, body: { models: ["stub-a", "stub-b"] } });
    expect(seen.at(-1)).toMatchObject({ method: "GET", url: "/v1/models" });
    const p = (await add(provider({ baseUrl: `${base}/locked/v1` }))).body.provider as { id: string };
    expect((await fetchNames({ providerId: p.id })).body).toEqual({ models: ["stub-a", "stub-b"] });
  });
  it("say when the model's server answered without a list (the picker may test or type a model then), and nothing else", async () => {
    // answered, but no list: { listed: false, detail }
    const NO_LIST = "The address did not answer with a model list ({ data: [{ id }] }).";
    expect(await fetchNames({ baseUrl: `${base}/nolist/v1` })).toEqual({
      status: 200,
      body: { listed: false, detail: "The model's server answered HTTP 404: check the model name and the base URL." },
    });
    expect(await fetchNames({ baseUrl: `${base}/broken/v1` })).toEqual({ status: 200, body: { listed: false, detail: "The model's server answered HTTP 500." } });
    expect(await fetchNames({ baseUrl: `${base}/garbled/v1` })).toEqual({ status: 200, body: { listed: false, detail: NO_LIST } });
    expect(await fetchNames({ baseUrl: `${base}/shape/v1` })).toEqual({ status: 200, body: { listed: false, detail: NO_LIST } });
    // never reached, refused or too much: a plain failure, never "not listed"
    const plain = async (baseUrl: string, detail: string) => {
      const r = await fetchNames({ baseUrl });
      expect(r.status).toBe(502);
      expect(r.body).toEqual({ detail });
    };
    await plain(`${base}/locked/v1`, "The model's server answered HTTP 401: check the API key.");
    await plain(`${base}/forbidden/v1`, "The model's server answered HTTP 403: check the API key.");
    await plain(`${base}/busy/v1`, "The model's server answered HTTP 429: too many requests, or no credit left.");
    await plain(`${base}/huge/v1`, "The model list is too large.");
    await plain("http://127.0.0.1:9/v1", "Could not reach the address. Is the model's server running?");
  });
  it("never follow a redirect", async () => {
    const moved = await fetchNames({ baseUrl: `${base}/moved/v1` });
    expect(moved.status).toBe(502);
    expect(moved.body.detail).toContain("redirect");
    expect(moved.body.listed).toBeUndefined(); // a plain failure
    expect(seen.map((s) => s.url)).toEqual(["/moved/v1/models"]); // the target was never asked
    const test2 = await test({ baseUrl: `${base}/moved/v1`, model: "m" });
    expect(test2.body).toMatchObject({ ok: false });
    expect(test2.body.detail).toContain("redirect");
  });
});

describe("switching", () => {
  it("the next question is asked with the model just chosen, and none before one is", async () => {
    const p = (await add(provider())).body.provider as { id: string };
    const ask = async () => {
      const res = await question.POST(json("POST", "/api/assistant", { uid: null, question: "Which model are you?" }));
      expect(res.status).toBe(200);
      const text = await res.text();
      bodies.push(text);
      return text;
    };
    const none = await question.POST(json("POST", "/api/assistant", { uid: null, question: "Which model are you?" }));
    expect(none.status).toBe(503); // saved but not chosen, and LLM_* is never read
    expect(((await none.json()) as { detail: string }).detail).toBe(NO_MODEL);
    expect(seen).toHaveLength(0);

    const switched = await choose({ providerId: p.id, model: "stub-b" });
    expect(switched.status).toBe(200);
    expect(switched.body.summary).toMatchObject({ configured: true, name: "stub-b", provider: "Stand-in" });
    expect(await ask()).toContain("Answered by stub-b.");
    expect(seen.at(-1)).toMatchObject({ model: "stub-b", auth: `Bearer ${SECRET}` });

    expect((await choose({ providerId: p.id, model: "not-listed" })).status).toBe(400);
    expect((await choose({ providerId: ID, model: "stub-a" })).status).toBe(404);
    expect((await choose({ providerId: "environment", model: "env-model" })).status).toBe(400);
    expect((await choose({ providerId: p.id, model: "stub-a" })).body.active).toEqual({ providerId: p.id, model: "stub-a" });
    expect(await ask()).toContain("Answered by stub-a.");
    expect(seen.map((s) => s.model).filter(Boolean)).toEqual(["stub-b", "stub-a"]); // never env-model
  });
  it("a chosen model that can't be used any more is reported, not replaced", async () => {
    const p = (await add(provider({ baseUrl: "https://llm.example.com/v1", activate: true }))).body.provider as { id: string };
    expect(p).toBeTruthy();
    rmSync(path.join(dir, "models.key")); // its key can't be opened any more
    const res = await question.POST(json("POST", "/api/assistant", { uid: null, question: "hi" }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toBe(`Stand-in: ${MODELS_FAIL.sealed}`);
    expect(seen).toHaveLength(0);
  });
  it("Groq at its real address: added, its models fetched, chosen and asked (the stand-in answers for it)", async () => {
    const groq = presetOf("groq");
    expect(groq.baseUrl).toBe("https://api.groq.com/openai/v1");
    // whatever goes to api.groq.com goes to the stand-in instead: nothing leaves this machine here
    const real = globalThis.fetch;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      return real(url.startsWith(groq.baseUrl) ? `${base}/groq/v1${url.slice(groq.baseUrl.length)}` : input, init);
    });
    try {
      const added = await add({ name: "Groq", preset: "groq", baseUrl: groq.baseUrl, models: ["llama-3.3-70b-versatile"], apiKey: SECRET });
      expect(added.status).toBe(201);
      const p = added.body.provider as { id: string; baseUrl: string; local: boolean; keySaved: boolean };
      expect(p).toMatchObject({ baseUrl: groq.baseUrl, local: false, keySaved: true });

      expect((await fetchNames({ providerId: p.id })).body).toEqual({ models: ["stub-a", "stub-b"] });
      expect(seen.at(-1)).toMatchObject({ method: "GET", url: "/groq/v1/models", auth: `Bearer ${SECRET}` });

      const chosen = await choose({ providerId: p.id, model: "llama-3.3-70b-versatile" });
      expect(chosen.status).toBe(200);
      const summary = chosen.body.summary as { configured: boolean; name: string; provider: string; local: boolean; reason: string };
      expect(summary).toEqual({ configured: true, name: "llama-3.3-70b-versatile", provider: "Groq", local: false, reason: "" });
      // the remote warning: the chip's tooltip names where the data goes
      const chip = chipState(summary);
      expect(chip.name).toBe("Model: llama-3.3-70b-versatile (Groq, remote)");
      expect(chip.title).toBe(
        "llama-3.3-70b-versatile (Groq): a remote model. Questions, the assessment data they need and relevant /add-on knowledge passages are sent to it.",
      );

      const res = await question.POST(json("POST", "/api/assistant", { uid: null, question: "Which model are you?" }));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("Answered by llama-3.3-70b-versatile.");
      expect(seen.at(-1)).toMatchObject({ method: "POST", url: "/groq/v1/chat/completions", auth: `Bearer ${SECRET}`, model: "llama-3.3-70b-versatile" });
    } finally {
      spy.mockRestore();
    }
  });
});
