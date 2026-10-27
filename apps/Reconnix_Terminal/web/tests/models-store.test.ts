/* The AI Assistant's saved models (lib/assistant/models/), on a temporary folder
   (RECONIX_ASSISTANT_DIR): the sealed keys (AES-256-GCM: a round trip, a changed byte, another
   key, another provider), the file (owner-only modes, atomic writes, links refused, a corrupt
   file refused with a fixed message, never a key in what the routes get), the rules every saved
   model passes (config.ts) and which model answers (resolve.ts: only a saved one, never one
   from LLM_BASE_URL / LLM_MODEL / LLM_API_KEY). Never touches ~/.reconix. */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkModel, FORM_WORDING } from "@/lib/assistant/config";
import { open, seal } from "@/lib/assistant/models/crypto";
import { MODELS_FAIL, ModelsError } from "@/lib/assistant/models/errors";
import { CLOUD_FIXED } from "@/lib/assistant/models/presets";
import { activeModel, activeModelSummary, modelsView, NO_MODEL, probeTarget } from "@/lib/assistant/models/resolve";
import { MAX_FILE_BYTES, MAX_MODELS, MAX_NAME, MAX_PROVIDERS, MAX_URL, MODELS_FORMAT } from "@/lib/assistant/models/schema";
import { addProvider, listProviders, MODELS_TEMP, modelsTempName, readSaved, removeProvider, setActive, updateProvider } from "@/lib/assistant/models/store";
import { addQuestion, deleteAllConversations, listConversations } from "@/lib/assistant/history-store";

const SECRET = "sk-test-0123456789abcdefSECRET";
const posix = process.platform !== "win32";
const saved = { ...process.env };
let root = "";
let dir = "";

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "reconix-models-test-"));
  dir = path.join(root, "assistant");
  process.env = { ...saved, RECONIX_ASSISTANT_DIR: dir };
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_MODEL;
  delete process.env.LLM_API_KEY;
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

const local = { name: "Local Ollama", preset: "ollama" as const, baseUrl: "http://127.0.0.1:11434/v1/", models: ["llama3.2", "qwen2.5:7b"] };
const remote = { name: "OpenRouter", preset: "openrouter" as const, baseUrl: "https://openrouter.ai/api/v1", models: ["openai/gpt-4o-mini"] };
const modeOf = (p: string) => statSync(p).mode & 0o777;
const fileText = () => readFileSync(path.join(dir, "models.json"), "utf8");

describe("sealed keys", () => {
  const key = randomBytes(32);
  const id = "00000000-0000-4000-8000-000000000001";
  it("open what seal made, with a new IV each time", () => {
    const a = seal(SECRET, key, id);
    const b = seal(SECRET, key, id);
    expect(open(a, key, id)).toBe(SECRET);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toContain(SECRET);
    expect(Buffer.from(a.iv, "base64")).toHaveLength(12);
    expect(Buffer.from(a.tag, "base64")).toHaveLength(16);
  });
  it("refuse a changed byte, a changed tag, another key and another provider", () => {
    const sealed = seal(SECRET, key, id);
    const flip = (b64: string) => {
      const bytes = Buffer.from(b64, "base64");
      bytes[0] ^= 1;
      return bytes.toString("base64");
    };
    expect(() => open({ ...sealed, data: flip(sealed.data) }, key, id)).toThrow(MODELS_FAIL.sealed);
    expect(() => open({ ...sealed, tag: flip(sealed.tag) }, key, id)).toThrow(MODELS_FAIL.sealed);
    expect(() => open({ ...sealed, iv: flip(sealed.iv) }, key, id)).toThrow(MODELS_FAIL.sealed);
    expect(() => open(sealed, randomBytes(32), id)).toThrow(ModelsError);
    expect(() => open(sealed, key, "00000000-0000-4000-8000-000000000002")).toThrow(MODELS_FAIL.sealed);
  });
});

describe("the rules every model passes", () => {
  it("say what is wrong in the form's words", () => {
    const form = (baseUrl: string, model = "m", apiKey: string | null = null) => {
      const r = checkModel({ baseUrl, model, apiKey }, { words: FORM_WORDING });
      return r.ok ? "ok" : r.reason;
    };
    expect(form("nope")).toBe("The base URL is not a valid address.");
    expect(form("file:///etc/passwd")).toBe("The base URL must start with http:// or https://.");
    expect(form("https://u:p@llm.example.com/v1")).toBe("Put the key in the API key field, not in the base URL.");
    expect(form("https://llm.example.com/v1")).toBe("ok"); // off this machine: allowed by default
    expect(form("http://llm.example.com/v1", "m", "k")).toBe("An API key is only sent over https to a remote model.");
    expect(form("http://127.0.0.1:1/v1", "a b")).toBe("The model name holds characters a model name doesn't use.");
    expect(form("http://127.0.0.1:1/v1", "m", "k")).toBe("ok"); // a key to this machine over http is fine
  });
  it("measure the address as it is kept: one that %-encoding makes too long is refused", async () => {
    const grows = `http://127.0.0.1:1/${"é".repeat(400)}`; // 419 characters typed, 2 419 written out
    expect(grows.length).toBeLessThan(MAX_URL);
    const r = checkModel({ baseUrl: grows, model: "m", apiKey: null });
    expect(r.ok ? "ok" : r.reason).toBe(`The base URL is too long once its special characters are encoded: at most ${MAX_URL} characters.`);
    const fits = `http://127.0.0.1:1/${"a".repeat(MAX_URL - 19)}`;
    expect(checkModel({ baseUrl: fits, model: "m", apiKey: null }).ok).toBe(true);
    const saving = addProvider({ ...local, baseUrl: grows });
    await expect(saving).rejects.toThrow("too long");
    await expect(saving).rejects.toMatchObject({ status: 400 }); // said as such, never a 500
    expect(existsSync(path.join(dir, "models.json"))).toBe(false);
  });
  it("keep an address as the server keeps it: no query, hash or trailing slashes", () => {
    const r = checkModel({ baseUrl: "http://127.0.0.1:1/v1/?x=1#y", model: "m", apiKey: null });
    expect(r).toEqual({ ok: true, config: { baseUrl: "http://127.0.0.1:1/v1", model: "m", apiKey: null, local: true } });
  });
});

describe("the saved models", () => {
  it("make the folder 0700, models.json and models.key 0600, and seal the key", async () => {
    await addProvider({ ...local, apiKey: SECRET });
    expect(readdirSync(dir).sort()).toEqual(["models.json", "models.key"]); // no temporary file left
    if (posix) {
      expect(modeOf(dir)).toBe(0o700);
      expect(modeOf(path.join(dir, "models.json"))).toBe(0o600);
      expect(modeOf(path.join(dir, "models.key"))).toBe(0o600);
    }
    expect(statSync(path.join(dir, "models.key")).size).toBe(32);
    const text = fileText();
    expect(text).not.toContain(SECRET);
    expect(JSON.parse(text)).toMatchObject({ format: MODELS_FORMAT, active: null, providers: [{ name: "Local Ollama", baseUrl: "http://127.0.0.1:11434/v1" }] });
    const { file, apiKeyOf } = await readSaved();
    expect(apiKeyOf(file.providers[0])).toBe(SECRET);
  });
  it("never hand a key to what the routes show", async () => {
    await addProvider({ ...local, apiKey: SECRET, activate: true });
    const listed = await listProviders();
    expect(JSON.stringify(listed)).not.toContain(SECRET);
    expect(listed.providers[0]).toMatchObject({ keySaved: true, local: true });
    expect(Object.keys(listed.providers[0]).sort()).toEqual(["baseUrl", "id", "keySaved", "local", "models", "name", "preset"]);
    const view = await modelsView();
    expect(JSON.stringify(view)).not.toContain(SECRET);
  });
  it("write atomically: a change replaces the file, and the old key stays readable", async () => {
    const p = await addProvider({ ...local, apiKey: SECRET });
    const before = lstatSync(path.join(dir, "models.json")).ino;
    await updateProvider(p.id, { name: "Ollama on this machine" });
    expect(lstatSync(path.join(dir, "models.json")).ino).not.toBe(before); // a new file renamed over it
    expect(readdirSync(dir).filter((n) => n.endsWith(".tmp"))).toEqual([]);
    const { file, apiKeyOf } = await readSaved();
    expect(file.providers[0].name).toBe("Ollama on this machine");
    expect(apiKeyOf(file.providers[0])).toBe(SECRET); // no key sent: the saved one stays
  });
  it("refuse a corrupt file with a fixed message, and never replace it", async () => {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(dir, "models.json"), "{ not json", { mode: 0o600 });
    await expect(listProviders()).rejects.toThrow(MODELS_FAIL.read);
    await expect(addProvider(local)).rejects.toThrow(MODELS_FAIL.read);
    expect(fileText()).toBe("{ not json");
    const wrongShape = { format: MODELS_FORMAT, providers: [], active: { providerId: "00000000-0000-4000-8000-000000000001", model: "m" } };
    writeFileSync(path.join(dir, "models.json"), JSON.stringify(wrongShape));
    await expect(listProviders()).rejects.toThrow(MODELS_FAIL.read); // the choice names no saved model
    const resolved = await activeModel();
    expect(resolved.ok).toBe(false); // reported, never replaced
    expect(!resolved.ok && resolved.reason).toBe(MODELS_FAIL.read);
  });
  it.runIf(posix)("refuse links: the file, the key and the folder", async () => {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const elsewhere = path.join(root, "elsewhere.json");
    writeFileSync(elsewhere, JSON.stringify({ format: MODELS_FORMAT, providers: [], active: null }));
    symlinkSync(elsewhere, path.join(dir, "models.json"));
    await expect(listProviders()).rejects.toThrow(MODELS_FAIL.read);
    rmSync(path.join(dir, "models.json"));

    const p = await addProvider({ ...local, apiKey: SECRET });
    rmSync(path.join(dir, "models.key"));
    writeFileSync(path.join(root, "other.key"), randomBytes(32));
    symlinkSync(path.join(root, "other.key"), path.join(dir, "models.key"));
    await expect(readSaved()).rejects.toThrow(MODELS_FAIL.key);
    await expect(updateProvider(p.id, { apiKey: "another-key" })).rejects.toThrow(MODELS_FAIL.key);

    rmSync(dir, { recursive: true });
    mkdirSync(path.join(root, "real"), { mode: 0o700 });
    symlinkSync(path.join(root, "real"), dir);
    await expect(addProvider(local)).rejects.toThrow(MODELS_FAIL.plain);
    expect(readdirSync(path.join(root, "real"))).toEqual([]);
  });
  it.runIf(posix)("refuse a models.key other users may read, without tightening it", async () => {
    const p = await addProvider({ ...local, apiKey: SECRET, activate: true });
    const keyFile = path.join(dir, "models.key");
    for (const mode of [0o640, 0o604, 0o620]) {
      chmodSync(keyFile, mode);
      await expect(readSaved()).rejects.toThrow(MODELS_FAIL.keyShared);
      await expect(updateProvider(p.id, { apiKey: "another-key" })).rejects.toThrow(MODELS_FAIL.keyShared);
      await expect(modelsView()).rejects.toThrow(MODELS_FAIL.keyShared); // GET models says so
      const r = await activeModel();
      expect(!r.ok && r.reason).toBe(MODELS_FAIL.keyShared); // so does asking
      expect((await activeModelSummary()).reason).toBe(MODELS_FAIL.keyShared); // and the page
      expect(modeOf(keyFile)).toBe(mode); // left as it was found, never chmodded
    }
    expect(MODELS_FAIL.keyShared).toContain("enter the API keys again");
    rmSync(keyFile); // what the message says to do: the key is entered again
    expect(await updateProvider(p.id, { apiKey: "another-key" })).toMatchObject({ keySaved: true });
    expect(modeOf(keyFile)).toBe(0o600);
    const { file, apiKeyOf } = await readSaved();
    expect(apiKeyOf(file.providers[0])).toBe("another-key");
  });
  it("clear a models.json write that never finished, once it is stale", async () => {
    await addProvider(local);
    expect(MODELS_TEMP.test(modelsTempName())).toBe(true); // the names the store writes
    const stale = path.join(dir, ".models.0123456789ab.tmp");
    const fresh = path.join(dir, ".models.ba9876543210.tmp");
    const other = path.join(dir, ".models.json.tmp"); // not a name of ours: left alone
    for (const name of [stale, fresh, other]) writeFileSync(name, "{", { mode: 0o600 });
    const old = new Date(Date.now() - 11 * 60_000);
    utimesSync(stale, old, old);
    utimesSync(other, old, old);
    await listConversations(); // the conversations' housekeeping clears both stores' leftovers
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(fresh)).toBe(true); // a write may still be going on
    expect(existsSync(other)).toBe(true);
    expect((await listProviders()).providers).toHaveLength(1);
    expect(await deleteAllConversations()).toBe(0);
    expect(existsSync(fresh)).toBe(true); // "Delete all" is about the conversations only
  });
  it("keep every provider the schema allows, each at its largest, and stay readable", async () => {
    const big = (i: number) => ({
      name: `Provider ${String(i).padStart(2, "0")} `.padEnd(MAX_NAME, "x"),
      preset: "custom" as const,
      baseUrl: `http://127.0.0.1:11434/${"p".repeat(MAX_URL - 23)}`,
      models: Array.from({ length: MAX_MODELS }, (_, m) => `m${i}-${m}-`.padEnd(128, "x")),
      apiKey: "k".repeat(4_096),
    });
    for (let i = 0; i < MAX_PROVIDERS; i += 1) await addProvider(big(i));
    const size = statSync(path.join(dir, "models.json")).size;
    expect(size).toBeGreaterThan(200_000); // the old limit would have locked this file
    expect(size).toBeLessThanOrEqual(MAX_FILE_BYTES);
    await expect(addProvider(big(MAX_PROVIDERS))).rejects.toMatchObject({ status: 400 }); // the count first
    const { file, apiKeyOf } = await readSaved();
    expect(file.providers).toHaveLength(MAX_PROVIDERS);
    expect(apiKeyOf(file.providers[MAX_PROVIDERS - 1])).toBe("k".repeat(4_096));
    const last = file.providers[MAX_PROVIDERS - 1];
    await setActive({ providerId: last.id, model: last.models[MAX_MODELS - 1] }); // still writable
    expect((await activeModel()).ok).toBe(true);
  });
  it("leave the conversations alone, and the conversations leave them alone", async () => {
    await addProvider({ ...local, apiKey: SECRET });
    await addQuestion({ scope: { uid: null, label: "All assessments" }, question: "hi" });
    expect(await listConversations()).toHaveLength(1);
    expect(await deleteAllConversations()).toBe(1);
    expect(existsSync(path.join(dir, "models.json"))).toBe(true);
    expect(existsSync(path.join(dir, "models.key"))).toBe(true);
    expect((await listProviders()).providers).toHaveLength(1);
  });

  it("check names: cleaned and unique (Environment is a name like any other)", async () => {
    await addProvider(local);
    await expect(addProvider({ ...local, name: " local OLLAMA " })).rejects.toThrow("saved already");
    expect((await addProvider({ ...local, name: "Environment" })).name).toBe("Environment");
    await expect(addProvider({ ...local, name: " ​ " })).rejects.toThrow("Give the provider a name.");
    const p = await addProvider({ ...local, name: "Two\nlines\u0007 here" });
    expect(p.name).toBe("Two lines here");
  });
  it("save a remote model by default (cloud allowed), its key only over https", async () => {
    await expect(addProvider({ ...remote, baseUrl: "http://openrouter.ai/api/v1", apiKey: SECRET })).rejects.toThrow("only sent over https");
    const p = await addProvider({ ...remote, apiKey: SECRET });
    expect(p).toMatchObject({ local: false, keySaved: true });
    expect(existsSync(path.join(dir, "models.json")) && fileText()).not.toContain(SECRET);
  });
  it("keep a saved key only while the address stays on its host", async () => {
    const p = await addProvider({ ...remote, apiKey: SECRET });
    await expect(updateProvider(p.id, { baseUrl: "https://evil.example/v1" })).rejects.toThrow("enter the API key again");
    expect((await updateProvider(p.id, { baseUrl: "https://openrouter.ai/api/v2" }))?.keySaved).toBe(true);
    // another host: a cloud preset's name stays with its own address; as Custom it may move
    await expect(updateProvider(p.id, { baseUrl: "https://other.example/v1", apiKey: "new-key" })).rejects.toMatchObject({ message: CLOUD_FIXED, status: 400 });
    expect((await updateProvider(p.id, { preset: "custom", baseUrl: "https://other.example/v1", apiKey: "new-key" }))?.keySaved).toBe(true);
    expect((await updateProvider(p.id, { removeKey: true }))?.keySaved).toBe(false);
    const { file, apiKeyOf } = await readSaved();
    expect(apiKeyOf(file.providers[0])).toBeNull();
    expect(await updateProvider("00000000-0000-4000-8000-000000000009", { name: "x" })).toBeNull();
  });
  it("move the active choice with the provider", async () => {
    const p = await addProvider({ ...local, activate: true });
    expect((await listProviders()).active).toEqual({ providerId: p.id, model: "llama3.2" });
    await setActive({ providerId: p.id, model: "qwen2.5:7b" });
    await updateProvider(p.id, { models: ["llama3.2", "phi4"] }); // the active one left the list
    expect((await listProviders()).active).toEqual({ providerId: p.id, model: "llama3.2" });
    await expect(setActive({ providerId: p.id, model: "not-listed" })).rejects.toThrow("not in the provider's list");
    expect(await removeProvider(p.id)).toBe(true);
    expect((await listProviders()).active).toBeNull();
    expect(await removeProvider(p.id)).toBe(false);
  });
});

describe("which model answers", () => {
  // the web reads no model from its environment: these are ignored everywhere below
  const ENV = { LLM_BASE_URL: "http://127.0.0.1:11434/v1", LLM_MODEL: "env-model", LLM_API_KEY: "sk-env-key" };
  beforeEach(() => void Object.assign(process.env, ENV));
  it("is none while nothing is chosen, whatever LLM_BASE_URL, LLM_MODEL and LLM_API_KEY say", async () => {
    const r = await activeModel();
    expect(r).toEqual({ ok: false, reason: NO_MODEL, summary: { configured: false, name: "", provider: "", local: false, reason: NO_MODEL } });
    expect(NO_MODEL).toBe("No AI model is set up yet. Add one with the model chip under the message box (+ Model).");
    expect(existsSync(dir)).toBe(false); // reading made no folder
    const view = await modelsView();
    expect(view).toEqual({ providers: [], active: null, summary: (await activeModel()).summary });
    expect(JSON.stringify(view)).not.toMatch(/env-model|sk-env-key|11434/);
    await expect(probeTarget({ providerId: "00000000-0000-4000-8000-000000000001" }, true)).rejects.toThrow("not saved any more");
  });
  it("is the saved choice when there is one, with its key", async () => {
    const p = await addProvider({ ...local, apiKey: SECRET, activate: true });
    await setActive({ providerId: p.id, model: "qwen2.5:7b" });
    const r = await activeModel();
    expect(r).toMatchObject({ ok: true, config: { baseUrl: "http://127.0.0.1:11434/v1", model: "qwen2.5:7b", apiKey: SECRET }, summary: { provider: "Local Ollama", name: "qwen2.5:7b" } });
    expect(JSON.stringify(r.summary)).not.toContain(SECRET);
    const view = await modelsView();
    expect(view.active).toEqual({ providerId: p.id, model: "qwen2.5:7b" });
    expect(Object.keys(view).sort()).toEqual(["active", "providers", "summary"]);
    await removeProvider(p.id);
    expect((await modelsView()).active).toBeNull();
    expect((await activeModel()).ok).toBe(false); // nothing answers in its place
  });
  it("answers with a remote choice (cloud allowed), and says why one can't be used instead of asking another model", async () => {
    await addProvider({ ...remote, apiKey: SECRET, activate: true });
    const r = await activeModel();
    expect(r).toMatchObject({ ok: true, config: { baseUrl: "https://openrouter.ai/api/v1", apiKey: SECRET, local: false }, summary: { configured: true, provider: "OpenRouter", local: false } });
    rmSync(path.join(dir, "models.key")); // the key can't be opened any more
    const lost = await activeModel();
    expect(!lost.ok && lost.reason).toBe(`OpenRouter: ${MODELS_FAIL.sealed}`);
    expect(lost.summary).toMatchObject({ configured: false, name: "openai/gpt-4o-mini", provider: "OpenRouter", local: false });
  });
  it("is summed up for the page by the same rules, without reading or opening any key", async () => {
    const same = async () => expect(await activeModelSummary()).toEqual((await activeModel()).summary);
    await same();
    process.env.LLM_BASE_URL = "nope";
    await same();
    expect(existsSync(dir)).toBe(false); // reading made no folder
    await addProvider({ ...remote, apiKey: SECRET, activate: true });
    await same(); // a remote model: the same summary
    await addProvider({ ...local, apiKey: SECRET, activate: true });
    await same();
    // another key of the same shape: asking finds it can't open the sealed key, but the summary
    // never read it, so it can't tell (the reason shows when a question is asked)
    writeFileSync(path.join(dir, "models.key"), randomBytes(32), { mode: 0o600 });
    const asked = await activeModel();
    expect(!asked.ok && asked.reason).toBe(`Local Ollama: ${MODELS_FAIL.sealed}`);
    expect(await activeModelSummary()).toMatchObject({ configured: true, name: "llama3.2", provider: "Local Ollama" });
    rmSync(path.join(dir, "models.key")); // no key file at all: both say so
    await same();
    expect((await activeModelSummary()).reason).toBe(`Local Ollama: ${MODELS_FAIL.sealed}`);
    writeFileSync(path.join(dir, "models.json"), "{ not json");
    await same();
  });
  it("sends a saved key only to its saved address when testing", async () => {
    const p = await addProvider({ ...local, apiKey: SECRET });
    expect(await probeTarget({ providerId: p.id }, true)).toMatchObject({ baseUrl: "http://127.0.0.1:11434/v1", apiKey: SECRET, model: "llama3.2" });
    expect(await probeTarget({ baseUrl: "http://127.0.0.1:9/v1", model: "m" }, true)).toMatchObject({ apiKey: null });
    await expect(probeTarget({ baseUrl: "http://127.0.0.1:9/v1" }, true)).rejects.toThrow("Name a model to test.");
    expect(await probeTarget({ baseUrl: "https://llm.example.com/v1/" }, false)).toEqual({ baseUrl: "https://llm.example.com/v1", model: "", apiKey: null, local: false }); // remote: allowed
    await expect(probeTarget({ baseUrl: "http://llm.example.com/v1", apiKey: SECRET }, false)).rejects.toThrow("only sent over https");
    await expect(probeTarget({ providerId: "environment" }, true)).rejects.toThrow("not saved any more"); // the routes refuse it before
  });
});
