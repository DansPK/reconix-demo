import assert from "node:assert/strict";
import { test } from "node:test";
import { ADDABLE_TYPES, PRESET_MODELS, providerFields, providerSave, testStatus } from "../../src/providerLogic";

const form = { providerType: "OPENAI" as const, displayName: "  ", modelName: " gpt-4o ", baseUrl: " ", apiKey: " sk-test-1234 " };

test("adding: trimmed, empty fields left out, the name defaults to the model's", () => {
  assert.deepEqual(providerSave(undefined, form), {
    kind: "create",
    input: { providerType: "OPENAI", displayName: "gpt-4o", modelName: "gpt-4o", apiKey: "sk-test-1234" },
  });
  assert.deepEqual(providerSave(undefined, { ...form, providerType: "OLLAMA", apiKey: undefined, baseUrl: "http://localhost:11434" }), {
    kind: "create",
    input: { providerType: "OLLAMA", displayName: "gpt-4o", modelName: "gpt-4o", baseUrl: "http://localhost:11434" },
  });
});

test("editing: an empty key keeps the saved one; the type isn't sent", () => {
  assert.deepEqual(providerSave("llm-1", { ...form, displayName: "Mine", apiKey: "" }), {
    kind: "update",
    update: { displayName: "Mine", modelName: "gpt-4o" },
  });
  assert.deepEqual(providerSave("llm-1", { ...form, apiKey: "new-key" }), {
    kind: "update",
    update: { displayName: "gpt-4o", modelName: "gpt-4o", apiKey: "new-key" },
  });
});

test("a model name is required", () => {
  assert.equal(providerSave(undefined, { ...form, modelName: "  " }).kind, "invalid");
});

test("test status: works with the time, or why it failed; the key never appears", () => {
  assert.deepEqual(testStatus({ ok: true, modelName: "gpt-4o", latencyMs: 812 }, true), { tone: "ok", text: "Works: gpt-4o answered in 812 ms." });
  assert.deepEqual(testStatus({ ok: false, modelName: "gpt-4o", latencyMs: 0, code: "MISSING_API_KEY", message: "GPT-4o has no API key." }, true),
    { tone: "error", text: "Saved, but the test failed: GPT-4o has no API key." });
  assert.deepEqual(testStatus({ ok: false, modelName: "x", latencyMs: 0, code: "MODEL_UNAVAILABLE" }, false),
    { tone: "error", text: "The test failed: MODEL_UNAVAILABLE" });
});

test("test status with neither a message nor a code still reads as a sentence", () => {
  assert.deepEqual(testStatus({ ok: false, modelName: "x", latencyMs: 0 }, false), { tone: "error", text: "The test failed: no answer" });
});

test("editing never sends an emptied base URL (core may read it as 'not sent', Q19)", () => {
  assert.deepEqual(providerSave("llm-1", { providerType: "OLLAMA", displayName: "Local", modelName: "llama3.1:8b", baseUrl: "" }), {
    kind: "update",
    update: { displayName: "Local", modelName: "llama3.1:8b" },
  });
});

test("provider fields: base URL for Ollama (optional) and compatible APIs (required); keys for the rest; Reconix has optional key", () => {
  assert.deepEqual(providerFields("OLLAMA"), { baseUrl: "optional", apiKey: "none" });
  assert.deepEqual(providerFields("RECONIX"), { baseUrl: "none", apiKey: "optional" });
  assert.deepEqual(providerFields("OPENAI_API_COMPATIBLE"), { baseUrl: "required", apiKey: "optional" });
  for (const t of ["OPENAI", "ANTHROPIC", "DEEPSEEK"] as const) assert.deepEqual(providerFields(t), { baseUrl: "none", apiKey: "required" });
  assert.ok(!ADDABLE_TYPES.includes("RECONIX"), "the built-in model can't be added");
});

test("editing RECONIX only sends apiKey so core does not reject with BUILT_IN_PROVIDER", () => {
  assert.deepEqual(providerSave("llm-reconix", { providerType: "RECONIX", displayName: "Reconix", modelName: "reconix", apiKey: "sk-reconix-secret" }), {
    kind: "update",
    update: { apiKey: "sk-reconix-secret" },
  });
});

test("preset models exist for OpenAI, Anthropic, DeepSeek, and Ollama", () => {
  assert.ok((PRESET_MODELS.OPENAI ?? []).includes("gpt-4o"));
  assert.ok((PRESET_MODELS.ANTHROPIC ?? []).includes("claude-3-5-sonnet-latest"));
  assert.ok((PRESET_MODELS.DEEPSEEK ?? []).includes("deepseek-chat"));
  assert.ok((PRESET_MODELS.OLLAMA ?? []).includes("llama3.1:8b"));
});
