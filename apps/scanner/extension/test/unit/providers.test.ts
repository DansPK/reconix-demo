import assert from "node:assert/strict";
import { test } from "node:test";
import { McpBackend } from "../../src/backend/McpBackend";
import { startDemo } from "./helpers";

const KEY = "sk-ant-not-a-real-key-7f2d";

test("add with a key → test → approve → active; only the key's last 4 characters are kept and nothing is sent", async (t) => {
  const realFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (() => { requests++; throw new Error("no network"); }) as typeof fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  const backend = new McpBackend({ serverUrl: "http://127.0.0.1:1", getToken: async () => "t" });

  await assert.rejects(backend.createProvider({ providerType: "ANTHROPIC", displayName: "C", modelName: "claude-opus-5-5" }), /needs an API key/);
  const made = await backend.createProvider({ providerType: "ANTHROPIC", displayName: "Claude", modelName: "claude-opus-5-5", apiKey: KEY });
  assert.equal(made.apiKeyLast4, "7f2d");
  assert.deepEqual(await backend.testProvider(made.id), { ok: true, modelName: "claude-opus-5-5", latencyMs: 120 });
  const { approvalId } = await backend.activateProvider(made.id);
  assert.ok(approvalId, "a model off this computer asks first");
  await backend.approve(approvalId);
  assert.deepEqual((await backend.listProviders()).filter((p) => p.isActive).map((p) => p.id), [made.id]);
  await assert.rejects(backend.deleteProvider(made.id), /active provider cannot be deleted/);

  // Everything the backend holds, walked: the key is nowhere.
  assert.ok(!JSON.stringify(backend, (_k, v) => (v instanceof Map ? [...v] : v)).includes(KEY.slice(0, 10)));
  assert.equal(requests, 0);
});

test("the built-in model only takes a key; a local model becomes active at once", async () => {
  const backend = new McpBackend({ serverUrl: "http://127.0.0.1:1", getToken: async () => "t" });
  assert.equal((await backend.updateProvider("llm-reconix", { apiKey: KEY })).apiKeyLast4, "7f2d");
  await assert.rejects(backend.updateProvider("llm-reconix", { modelName: "x" }), /cannot be changed/);
  await assert.rejects(backend.deleteProvider("llm-reconix"), /cannot be deleted/);
  const { approvalId, provider } = await backend.activateProvider("llm-ollama");
  assert.equal(approvalId, undefined);
  assert.ok(provider.isActive);
});

test("the chat switches models by name", async (t) => {
  const demo = await startDemo();
  t.after(demo.stop);
  const session = await demo.backend.createSession();
  assert.deepEqual((await demo.backend.chat(session.id, "switch to Qwen")).run, { kind: "switchModel", providerId: "llm-ollama" });
});
