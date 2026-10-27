/* The model picker's pure rules (components/assistant/): what the composer's chip says
   (model-picker-rules.ts); the list "Model" (every saved model, ✓ on the active one, a remote
   one as usable as a local one) and what removing a row sends
   (DELETE the provider with its last model, else PATCH its models) with the confirm's words;
   "Set the provider" (the presets in order, every one usable, the fields it
   shows, the saved provider it adds to, what a fetch or a test asks, where a fetch's answer
   leaves the Model field) and the requests "Add model" sends (POST a new provider made active,
   or PATCH the saved one and PUT the switch); a typed model name (model-name-rules.ts); where
   the arrow keys move (roving.ts) and which word on the model the assistant shows after a
   switch (model-switch.ts). e2e/assistant.spec.ts drives the picker. */
import { describe, expect, it } from "vitest";

import { nameProblem } from "@/components/assistant/model-name-rules";
import {
  addressOf,
  afterFetch,
  afterTest,
  chipState,
  choiceProblem,
  credentialsProblem,
  firstPreset,
  freeName,
  initialChoice,
  modelRows,
  NO_MODEL_YET,
  normalAddress,
  presetFor,
  probeOf,
  providerOptions,
  removeQuestion,
  removeRequest,
  requestsForAdd,
  savedFor,
  showsUrl,
  TYPED,
  typeInstead,
} from "@/components/assistant/model-picker-rules";
import { liveSwitch, switchOver } from "@/components/assistant/model-switch";
import { rovingIndex } from "@/components/assistant/roving";
import type { ModelSummary } from "@/components/assistant/types";
import { fitsPreset, presetOf, PRESETS } from "@/lib/assistant/models/presets";
import { MAX_MODELS } from "@/lib/assistant/models/schema";
import type { ModelsView, ProviderView } from "@/lib/assistant/models/view";

const ID = "0b0e2d55-1c5a-4b1e-9b8c-2f1d3c4b5a69";
const ID2 = "1c1f3e66-2d6b-4c2f-8c9d-3a2e4d5c6b7a";
const STUB = "http://127.0.0.1:3195/v1";

const provider = (over: Partial<ProviderView> = {}): ProviderView => ({ id: ID, name: "Stub", preset: "custom", baseUrl: STUB, models: ["stub-model"], keySaved: false, local: true, ...over });
const view = (over: Partial<ModelsView> = {}): ModelsView => ({
  providers: [],
  active: null,
  summary: { configured: false, name: "", provider: "", local: false, reason: "No AI model is set up yet." },
  ...over,
});
const none = { baseUrl: "", apiKey: "", removeKey: false };
const custom = presetOf("custom");
const anthropic = presetOf("anthropic");
const ollama = presetOf("ollama");

describe("the chip", () => {
  it("names the model that answers, green, with its provider in the name and the tooltip", () => {
    const chip = chipState({ configured: true, name: "stub-model", provider: "Stub", local: true, reason: "" });
    expect(chip).toMatchObject({ label: "stub-model", name: "Model: stub-model (Stub, local)", tone: "success" });
    expect(chip.title).toContain("Stub");
    const remote = chipState({ configured: true, name: "claude-sonnet-5-5", provider: "Anthropic", local: false, reason: "" });
    expect(remote.name).toBe("Model: claude-sonnet-5-5 (Anthropic, remote)");
    expect(remote.title).toContain("sent to it");
  });
  it("says Choose a model, amber, when none can answer (the reason in the tooltip)", () => {
    const reason = "No AI model is set up yet. Add one with the model chip under the message box (+ Model).";
    const empty = chipState({ configured: false, name: "", provider: "", local: false, reason });
    expect(empty).toEqual({ label: "Choose a model", name: "Choose a model", title: reason, tone: "warning" });
    const broken = chipState({ configured: false, name: "gpt-4o-mini", provider: "OpenAI", local: false, reason: "OpenAI: not on this machine." });
    expect(broken).toMatchObject({ label: "Choose a model", tone: "warning", title: "OpenAI: not on this machine." });
  });
});

describe("the list: your models", () => {
  it("lists every saved model in the order saved, ✓ on the active one, with its provider and where it runs", () => {
    const other = provider({ id: ID2, name: "Ollama", preset: "ollama", baseUrl: "http://127.0.0.1:11434/v1", models: ["llama3.2"] });
    const v = view({ providers: [provider({ models: ["stub-model", "stub-model-2"] }), other], active: { providerId: ID, model: "stub-model-2" } });
    expect(modelRows(v).map((r) => [r.model, r.provider, r.where, r.checked])).toEqual([
      ["stub-model", "Stub", "local", false],
      ["stub-model-2", "Stub", "local", true],
      ["llama3.2", "Ollama", "local", false],
    ]);
    expect(modelRows(v)[1].key).toBe(`${ID}/stub-model-2`);
  });
  it("lists a remote model as usable as any other (cloud allowed by default), marked remote", () => {
    const openai = provider({ name: "OpenAI", preset: "openai", baseUrl: "https://api.openai.com/v1", local: false, keySaved: true, models: ["gpt-4o-mini"] });
    const [row] = modelRows(view({ providers: [openai] }));
    expect(row).toEqual({ key: `${ID}/gpt-4o-mini`, providerId: ID, model: "gpt-4o-mini", provider: "OpenAI", where: "remote", checked: false });
  });
  it("is empty with nothing saved (no Environment row any more)", () => {
    expect(modelRows(view())).toEqual([]);
  });
  it("names a cloud provider saved at another address with its real host", () => {
    const moved = provider({ name: "OpenAI", preset: "openai", baseUrl: "https://llm.other.example/v1", local: false });
    expect(modelRows(view({ providers: [moved] }))[0].provider).toBe("OpenAI (llm.other.example)");
  });
});

describe("removing a model", () => {
  const two = provider({ models: ["stub-model", "stub-model-2"], keySaved: true });
  const v = view({ providers: [two], active: { providerId: ID, model: "stub-model" } });
  const [first, second] = modelRows(v);

  it("PATCHes the provider's list while it keeps other models, DELETEs it with its last one", () => {
    expect(removeRequest(v, second)).toEqual({ kind: "update", id: ID, body: { models: ["stub-model"] } });
    const one = view({ providers: [provider()] });
    expect(removeRequest(one, modelRows(one)[0])).toEqual({ kind: "delete", id: ID });
    expect(removeRequest(view(), second)).toBeNull(); // gone meanwhile
  });
  it("asks first, saying what follows", () => {
    expect(removeQuestion(v, second)).toEqual({ title: "Remove stub-model-2 (Stub)?", detail: "Stub keeps its other models." });
    expect(removeQuestion(v, first)).toEqual({ title: "Remove stub-model (Stub)?", detail: "Stub keeps its other models; stub-model-2 answers instead." });
    const one = view({ providers: [provider()], active: { providerId: ID, model: "stub-model" } });
    expect(removeQuestion(one, modelRows(one)[0]).detail).toBe("It is Stub's last model, so Stub is removed too. No model answers until you add or choose one.");
    const keyed = view({ providers: [provider({ keySaved: true })] });
    expect(removeQuestion(keyed, modelRows(keyed)[0]).detail).toBe("It is Stub's last model, so Stub and its saved API key are removed too.");
  });
});

describe("Set the provider", () => {
  it("offers every preset in the plan's order, the cloud ones included; it starts on the first local one", () => {
    const options = providerOptions();
    expect(options.map((o) => o.label)).toEqual(["OpenAI", "Anthropic", "DeepSeek", "OpenRouter", "Groq", "Ollama (local)", "LM Studio (local)", "Custom (OpenAI-compatible)"]);
    expect(options.every((o) => Object.keys(o).sort().join() === "id,label")).toBe(true); // nothing is disabled
    expect(firstPreset().id).toBe("ollama");
  });
  it("shows the base URL only for Custom and the local presets; a cloud one's address is fixed", () => {
    expect(PRESETS.filter(showsUrl).map((p) => p.id)).toEqual(["ollama", "lmstudio", "custom"]);
    expect(addressOf(anthropic, { baseUrl: "http://evil.example" })).toBe("https://api.anthropic.com/v1");
    expect(addressOf(custom, { baseUrl: ` ${STUB} ` })).toBe(STUB);
    expect(normalAddress(`${STUB}/?x=1#y`)).toBe(STUB);
    expect(normalAddress("nope")).toBeNull();
  });
  it("adds to the saved provider of that preset at that address, else to none", () => {
    const stub = provider();
    const v = view({ providers: [stub] });
    expect(savedFor(v, custom, `${STUB}/`)).toBe(stub); // the same address, spelled another way
    expect(savedFor(v, custom, "http://127.0.0.1:9/v1")).toBeNull();
    expect(savedFor(v, ollama, STUB)).toBeNull(); // another preset
    const openai = provider({ id: ID2, name: "OpenAI", preset: "openai", baseUrl: "https://api.openai.com/v1", local: false });
    expect(savedFor(view({ providers: [openai] }), presetOf("openai"), presetOf("openai").baseUrl)).toBe(openai);
    // a cloud preset saved elsewhere before the rule is Custom there
    const moved = provider({ name: "OpenAI", preset: "openai", baseUrl: "https://llm.other.example/v1", local: false });
    expect(presetFor(moved).id).toBe("custom");
    expect(fitsPreset(presetOf("openai"), "https://api.openai.com.evil.example/v1")).toBe(false);
    expect(savedFor(view({ providers: [moved] }), custom, "https://llm.other.example/v1")).toBe(moved);
  });
  it("says what is missing before anything is sent", () => {
    expect(credentialsProblem(custom, null, none)).toBe("Give the base URL (it usually ends in /v1).");
    expect(credentialsProblem(custom, null, { ...none, baseUrl: STUB })).toBeNull(); // a key is optional
    expect(credentialsProblem(anthropic, null, none)).toBe("Anthropic needs an API key.");
    expect(credentialsProblem(anthropic, null, { ...none, apiKey: "sk ant" })).toBe("An API key is printable characters without spaces.");
    const kept = provider({ name: "Anthropic", preset: "anthropic", baseUrl: anthropic.baseUrl, keySaved: true, local: false });
    expect(credentialsProblem(anthropic, kept, none)).toBeNull(); // the saved key is kept
    expect(credentialsProblem(anthropic, kept, { ...none, removeKey: true })).toBe("Anthropic needs an API key.");
  });
  it("asks a saved provider by its id while its key is kept, else as typed with only the key typed here", () => {
    const saved = provider({ keySaved: true });
    expect(probeOf(custom, saved, { ...none, baseUrl: STUB })).toEqual({ providerId: ID });
    expect(probeOf(custom, saved, { ...none, baseUrl: `${STUB}/` }, "stub-model")).toEqual({ providerId: ID, model: "stub-model" });
    expect(probeOf(custom, saved, { ...none, baseUrl: "http://127.0.0.1:9/v1" })).toEqual({ baseUrl: "http://127.0.0.1:9/v1" }); // never its key
    expect(probeOf(custom, saved, { ...none, baseUrl: STUB, apiKey: " new-key " })).toEqual({ baseUrl: STUB, apiKey: "new-key" });
    expect(probeOf(custom, saved, { ...none, baseUrl: STUB, removeKey: true })).toEqual({ baseUrl: STUB });
    expect(probeOf(anthropic, null, { ...none, apiKey: "sk-ant-0123" }, "claude-x")).toEqual({ baseUrl: "https://api.anthropic.com/v1", model: "claude-x", apiKey: "sk-ant-0123" });
  });
});

describe("Fetch models", () => {
  it("fills the Model field with the list the server gave", () => {
    expect(afterFetch({ ok: true, models: ["stub-model", "stub-model-2"] }, [])).toEqual({ next: "list", models: ["stub-model", "stub-model-2"], note: null, verify: false });
    expect(afterFetch({ ok: true, models: [] }, [])).toMatchObject({ next: "list", models: [], verify: true });
  });
  it("stays on a refusal or a failure, with the server's words, and never falls back", () => {
    const refused = { ok: false as const, status: 400, detail: "The base URL is not on this machine: assessment data would be sent there." };
    expect(afterFetch(refused, ["m"])).toEqual({ next: "stay", error: refused.detail, typeInstead: false });
    for (const detail of ["Could not reach the address. Is the model's server running?", "The model's server answered HTTP 401: check the API key.", "The model list is too large."]) {
      expect(afterFetch({ ok: false, status: 502, detail }, ["llama3.2"])).toEqual({ next: "stay", error: detail, typeInstead: false });
    }
  });
  it("tests a known model when the server answered without a list, else offers to type one", () => {
    const unlisted = { ok: true as const, listed: false as const, detail: "The model's server answered HTTP 404: check the model name and the base URL." };
    expect(afterFetch(unlisted, ["llama3.2", "qwen"])).toEqual({ next: "test", model: "llama3.2" });
    expect(afterFetch(unlisted, [])).toEqual({ next: "stay", error: unlisted.detail, typeInstead: true });
    expect(afterTest({ ok: true, result: { ok: true, detail: "Connected: llama3.2 answered." } }, ["llama3.2", "qwen"])).toMatchObject({ next: "list", models: ["llama3.2", "qwen"], verify: false });
    expect(afterTest({ ok: true, result: { ok: false, detail: "HTTP 401" } }, ["llama3.2"])).toEqual({ next: "stay", error: "HTTP 401", typeInstead: true });
    expect(afterTest({ ok: false, status: 400, detail: "An API key is only sent over https to a remote model." }, ["m"])).toMatchObject({ next: "stay", typeInstead: false });
    expect(typeInstead()).toMatchObject({ next: "list", models: [], verify: true });
  });
  it("starts the list on the saved provider's active model, else its first saved one, else the first listed", () => {
    const saved = provider({ models: ["b", "c"] });
    expect(initialChoice(["a", "b", "c"], saved, view({ providers: [saved], active: { providerId: ID, model: "c" } }))).toBe("c");
    expect(initialChoice(["a", "b", "c"], saved, view({ providers: [saved] }))).toBe("b");
    expect(initialChoice(["a", "x"], saved, view({ providers: [saved] }))).toBe("a");
    expect(initialChoice([], null, view())).toBeNull();
  });
  it("needs a model in the field, a typed one checked", () => {
    expect(choiceProblem(NO_MODEL_YET, "")).toBe("Fetch the provider's models, or type a model name.");
    expect(choiceProblem(TYPED, "two words")).toContain("letters, digits");
    expect(choiceProblem(TYPED, "llama3.2")).toBeNull();
    expect(choiceProblem("stub-model", "")).toBeNull();
    expect(nameProblem("  qwen:7b@q4 ")).toBeNull();
    expect(nameProblem("   ")).toBe("Type a model name.");
    expect(nameProblem("x".repeat(129))).toContain("at most 128");
  });
});

describe("Add model", () => {
  it("adds a provider not saved yet, named after its preset, with the model, made active", () => {
    const built = requestsForAdd(custom, null, view(), { ...none, baseUrl: ` ${STUB} `, apiKey: " k-1 " }, "stub-model-2");
    expect(built).toEqual({ ok: true, requests: { kind: "add", body: { name: "Custom", preset: "custom", baseUrl: STUB, models: ["stub-model-2"], apiKey: "k-1", activate: true } } });
    const cloud = requestsForAdd(anthropic, null, view(), { ...none, apiKey: "sk-ant-0123" }, "claude-x");
    expect(cloud.ok && cloud.requests).toEqual({ kind: "add", body: { name: "Anthropic", preset: "anthropic", baseUrl: "https://api.anthropic.com/v1", models: ["claude-x"], apiKey: "sk-ant-0123", activate: true } });
    const keyless = requestsForAdd(custom, null, view(), { ...none, baseUrl: STUB }, "m");
    expect(keyless.ok && keyless.requests.kind === "add" && "apiKey" in keyless.requests.body).toBe(false);
  });
  it("picks a name no other saved provider has", () => {
    expect(freeName("Custom", [])).toBe("Custom");
    expect(freeName("Custom", [provider({ name: "custom" }), provider({ id: ID2, name: "Custom 2" })])).toBe("Custom 3");
  });
  it("adds the model to the saved provider of that preset and address (PATCH), then switches to it (PUT)", () => {
    const stub = provider();
    const built = requestsForAdd(custom, stub, view({ providers: [stub] }), { ...none, baseUrl: STUB }, "stub-model-2");
    expect(built).toEqual({ ok: true, requests: { kind: "update", id: ID, body: { models: ["stub-model", "stub-model-2"] }, activate: { providerId: ID, model: "stub-model-2" } } });
    const same = requestsForAdd(custom, stub, view({ providers: [stub] }), { ...none, baseUrl: STUB }, "stub-model");
    expect(same.ok && same.requests).toEqual({ kind: "update", id: ID, body: null, activate: { providerId: ID, model: "stub-model" } });
  });
  it("sends a typed key, or removes the saved one when asked (a typed key wins)", () => {
    const saved = provider({ keySaved: true });
    const v = view({ providers: [saved] });
    const typed = requestsForAdd(custom, saved, v, { ...none, baseUrl: STUB, apiKey: "k2" }, "stub-model");
    expect(typed.ok && typed.requests.kind === "update" && typed.requests.body).toEqual({ apiKey: "k2" });
    const removed = requestsForAdd(custom, saved, v, { ...none, baseUrl: STUB, removeKey: true }, "stub-model");
    expect(removed.ok && removed.requests.kind === "update" && removed.requests.body).toEqual({ removeKey: true });
  });
  it("saves a cloud provider kept at another address as Custom", () => {
    const moved = provider({ name: "OpenAI", preset: "openai", baseUrl: "https://llm.other.example/v1", local: false, keySaved: true });
    const built = requestsForAdd(custom, moved, view({ providers: [moved] }), { ...none, baseUrl: moved.baseUrl }, "stub-model");
    expect(built.ok && built.requests.kind === "update" && built.requests.body).toEqual({ preset: "custom" });
  });
  it("refuses a model past the provider's limit", () => {
    const full = provider({ models: Array.from({ length: MAX_MODELS }, (_, i) => `m${i}`) });
    const built = requestsForAdd(custom, full, view({ providers: [full] }), { ...none, baseUrl: STUB }, "one-more");
    expect(!built.ok && built.problem).toContain(`${MAX_MODELS} models`);
    expect(requestsForAdd(custom, full, view({ providers: [full] }), { ...none, baseUrl: STUB }, "m3").ok).toBe(true);
  });
});

describe("the arrow keys in the picker's list", () => {
  it("move focus, wrapping, with Home and End; other keys don't", () => {
    expect(rovingIndex("ArrowDown", 0, 3)).toBe(1);
    expect(rovingIndex("ArrowRight", 2, 3)).toBe(0);
    expect(rovingIndex("ArrowUp", 0, 3)).toBe(2);
    expect(rovingIndex("Home", 2, 3)).toBe(0);
    expect(rovingIndex("End", 0, 3)).toBe(2);
    expect(rovingIndex("Enter", 0, 3)).toBeNull();
    expect(rovingIndex("ArrowDown", -1, 3)).toBeNull();
    expect(rovingIndex("ArrowDown", 0, 0)).toBeNull();
  });
});

describe("the model the assistant shows after a switch", () => {
  const summary = (name: string, over: Partial<ModelSummary> = {}): ModelSummary => ({ configured: true, name, provider: "Ollama", local: true, reason: "", ...over });
  const A = summary("llama3.2");
  const B = summary("qwen:7b");

  it("is the picker's while the page still names the model it replaced", () => {
    const s = switchOver(A, B);
    expect(liveSwitch(A, s)?.model).toBe(B);
    expect(liveSwitch({ ...A }, s)?.model).toBe(B);
    expect(liveSwitch({ ...A, configured: false, reason: "down" }, s)?.model).toBe(B);
  });
  it("is the page's once it has caught up, or moved on", () => {
    const s = switchOver(A, B);
    expect(liveSwitch({ ...B }, s)).toBeNull();
    expect(liveSwitch(summary("phi4"), s)).toBeNull();
    expect(liveSwitch(A, null)).toBeNull();
  });
});
