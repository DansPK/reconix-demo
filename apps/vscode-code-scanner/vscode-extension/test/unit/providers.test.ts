import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { HarnessClient } from "../../src/client";
import { FakeHarness } from "../../server/server";

let fake: FakeHarness;
let c: HarnessClient;

before(async () => {
  fake = new FakeHarness({ stepMs: 30 });
  await fake.start();
  c = new HarnessClient(fake.url, fake.token);
  await c.connect();
});
after(async () => {
  await c.close();
  await fake.stop();
});

test("list_providers returns the full catalog in dropdown order", async () => {
  const { providers, active } = await c.listProviders();
  assert.deepEqual(providers.map((p) => p.id),
    ["reconix", "openai", "anthropic", "deepseek", "ollama", "openai_compatible"]);
  assert.equal(providers.find((p) => p.id === "anthropic")?.base_url, "https://api.anthropic.com");
  assert.equal(active?.provider_id, "reconix");
});

test("set key → test with a model name → activate; keys never come back", async () => {
  const set = await c.setProvider("anthropic", { api_key: "sk-secret-value" });
  assert.equal(set.configured, true);
  assert.ok(!JSON.stringify(set).includes("sk-secret-value"));

  const tested = await c.testProvider("anthropic", "claude-opus-5-5");
  assert.equal(tested.status, "REACHABLE");
  assert.deepEqual(tested.models, ["claude-opus-5-5"]);

  const active = await c.activateModel("anthropic", "claude-opus-5-5");
  assert.equal(active.provider_id, "anthropic");
  assert.equal(active.model, "claude-opus-5-5");
  assert.equal((await c.activeModel()).active?.model, "claude-opus-5-5");
});

test("activate refuses an untested provider", async () => {
  await c.setProvider("openai_compatible", { api_key: "sk-x", models: ["gpt-4o"] });
  await assert.rejects(c.activateModel("openai_compatible", "gpt-4o"), /not reachable/);
});
