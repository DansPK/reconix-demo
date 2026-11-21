/* The model picker's rules (model-chip.tsx, model-picker.tsx, its list model-list.tsx and its
   "Set the provider" form model-provider-form.tsx), before the server checks everything again:
   what the chip says; the list's rows (every saved model, ✓ on the one that answers next) and
   what removing one sends (DELETE the provider with its last model, else PATCH its models); the
   form's provider options (the presets in order, every one usable: cloud included), which
   fields it shows, the saved provider it adds to (the same preset at the same address), what a
   fetch or a test asks, where a fetch's answer leaves the model field, and the requests "Add
   model" sends (a new provider made active, or the saved one's changes and a switch). A saved key
   goes only to its saved address: anything else is asked as typed, with only the key typed here.
   A cloud preset's name only goes with the cloud's own address. Pure: browser and tests. */
import { fitsPreset, type Preset, presetOf, PRESETS } from "@/lib/assistant/models/presets";
import type { AddProvider, Probe, SetActive, UpdateProvider } from "@/lib/assistant/models/requests";
import { API_KEY_CHARS, baseUrlProblem, MAX_KEY, MAX_MODELS, MAX_NAME, MIN_KEY } from "@/lib/assistant/models/schema";
import type { FetchResult, ModelsView, ProviderView } from "@/lib/assistant/models/view";
import { nameProblem } from "./model-name-rules";
import type { ModelSummary } from "./types";

export const NO_CHOICE = "Choose a model";

// --- the chip ------------------------------------------------------------------------------------

export interface ChipState {
  label: string; // what it shows: the model's name, or "Choose a model"
  name: string; // its accessible name (with the provider)
  title: string; // its tooltip
  tone: "success" | "warning"; // the dot: a model answers, or none can
}

/** What the composer's model chip says about the model that answers next. */
export function chipState(model: ModelSummary): ChipState {
  const usable = model.configured && model.name !== "";
  if (!usable) {
    return { label: NO_CHOICE, name: NO_CHOICE, title: model.reason || "No model answers yet: add one with + Model.", tone: "warning" };
  }
  const where = model.local ? "local" : "remote";
  const from = model.provider ? `${model.provider}, ${where}` : where;
  const title = model.local
    ? `${model.name} (${model.provider}): a local endpoint on this machine`
    : `${model.name} (${model.provider}): a remote model. The Core API sends it your questions and the session data they need.`;
  return { label: model.name, name: `Model: ${model.name} (${from})`, title, tone: "success" };
}

// --- the list: your models -----------------------------------------------------------------------

export interface ModelRow {
  key: string; // "<providerId>/<model>"
  providerId: string;
  model: string;
  provider: string; // the provider's name as shown
  where: "local" | "remote";
  preset: Preset["id"]; // the TUI provider it is shown under
  checked: boolean; // answers the next question
  first: boolean; // its provider's first model: the provider's heading goes above it
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

/** The preset a saved provider is shown and changed as: its own, except a cloud preset at
    another address (saved before the server tied the two together), which is Custom. */
export function presetFor(provider: ProviderView): Preset {
  const own = presetOf(provider.preset);
  return fitsPreset(own, provider.baseUrl) ? own : presetOf("custom");
}

/** A saved provider's name, with its real host when it was saved under a cloud preset it doesn't
    fit (the cloud's name never vouches for another address): "OpenAI (llm.example.com)". */
export const savedName = (provider: ProviderView) => (presetFor(provider).id === provider.preset ? provider.name : `${provider.name} (${hostOf(provider.baseUrl)})`);

/** The host (and port, if any) of a provider's base URL, or `fallback` when it has none. */
export const endpointHost = (baseUrl: string, fallback = ""): string => hostOf(baseUrl) || fallback;

/** A short label for a provider badge: replaces auto-generated "<Preset> · <model>" names
    with the endpoint host (for Custom) or preset label so badges don't repeat the model name. */
export function badgeLabel(provider: Pick<ProviderView, "baseUrl" | "name" | "preset">): string {
  const preset = presetOf(provider.preset);
  const host = hostOf(provider.baseUrl);
  if (preset.id === "custom" && provider.name.startsWith("Custom OpenAI-compatible") && host) return host;
  if (provider.name.startsWith(`${preset.label} · `)) return preset.label;
  return provider.name;
}

/** Every saved model, provider by provider in the order they were saved: ✓ on the one that
    answers next. */
export function modelRows(view: ModelsView): ModelRow[] {
  const active = view.active;
  return view.providers.flatMap((p) =>
    p.models.map((model, i) => ({
      first: i === 0,
      key: `${p.id}/${model}`,
      providerId: p.id,
      model,
      provider: savedName(p),
      where: p.local ? ("local" as const) : ("remote" as const),
      preset: presetFor(p).id,
      checked: active?.providerId === p.id && active.model === model,
    })),
  );
}

/** What removing sends: the provider with all its models and its saved key (DELETE). A
    provider's models are what it has (built in, or listed by its server), so none is removed
    alone. Null: the provider is not saved any more. */
export type RemoveRequest = { kind: "delete"; id: string } | { kind: "update"; id: string; body: UpdateProvider };

export function removeRequest(view: ModelsView, row: Pick<ModelRow, "providerId">): RemoveRequest | null {
  const p = view.providers.find((x) => x.id === row.providerId);
  return p ? { kind: "delete", id: p.id } : null;
}

/** The inline confirm's words: "Remove <provider>?" and what goes with it. */
export function removeQuestion(view: ModelsView, row: Pick<ModelRow, "providerId" | "provider">): { title: string; detail: string } {
  const p = view.providers.find((x) => x.id === row.providerId);
  const answering = view.active?.providerId === row.providerId;
  const subject = `${p?.models.length === 1 ? "Its model" : "Its models"}${p?.keySaved ? " and its saved API key" : ""}`;
  const what = `${subject} ${p?.models.length === 1 && !p?.keySaved ? "goes" : "go"} with it.`;
  return { title: `Remove ${row.provider}?`, detail: answering ? `${what} No model answers until you choose another.` : what };
}

// --- the form: Set the provider --------------------------------------------------------------------

export interface ProviderOption {
  id: Preset["id"];
  label: string;
}

/** The preset's name in the list, as the TUI's /provider names it. */
export const presetLabel = (preset: Preset) => preset.label;

/** The Provider select: the TUI's /provider list in its order, every one usable (a cloud one
    sends the questions off this machine: the form says so under it). */
export const providerOptions = (): ProviderOption[] => PRESETS.map((p) => ({ id: p.id, label: presetLabel(p) }));

/** The provider the form starts on: Reconix, the TUI's default. */
export const firstPreset = (): Preset => PRESETS[0];

/** Only Ollama and Custom take an address: Reconix's comes from the Core API's .env and a
    cloud service's is fixed (the TUI's provider form shows the same fields). */
export const showsUrl = (preset: Preset) => preset.kind === "local" || preset.kind === "custom";

/** Whether the form asks for an API key: not for Reconix (the Core API's .env) or Ollama. */
export const showsKey = (preset: Preset) => preset.key !== "none";

export interface Credentials {
  baseUrl: string; // as typed (only Custom and the local presets show the field)
  apiKey: string; // as typed: never filled in from a saved key
  removeKey: boolean;
}

/** The address the provider is asked at: the field's, or a cloud preset's own. */
export const addressOf = (preset: Preset, c: Pick<Credentials, "baseUrl">) => (showsUrl(preset) ? c.baseUrl.trim() : preset.baseUrl);

/** An address as the server keeps it (no query, hash or trailing slashes), or null when it isn't
    one: two spellings of one address compare equal. */
export function normalAddress(url: string): string | null {
  try {
    const u = new URL(url.trim());
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

const sameAddress = (a: string, b: string) => {
  if (a.trim() === b.trim()) return true;
  const na = normalAddress(a);
  return na !== null && na === normalAddress(b);
};

/** The saved provider "Add model" adds to: the one shown as this preset at this address (a cloud
    one is at the cloud's own address), or null (a new provider is saved). */
export const savedFor = (view: ModelsView, preset: Preset, address: string): ProviderView | null =>
  view.providers.find((p) => presetFor(p).id === preset.id && (preset.kind === "reconix" || sameAddress(p.baseUrl, address))) ?? null;

/** The models the form can list without asking anyone: a cloud service's built-in ones (the
    saved one first), Reconix's from the Core API; null: fetch or type the name. */
export function knownModels(preset: Preset, saved: ProviderView | null): string[] | null {
  if (preset.kind === "cloud") return [...new Set([...(saved?.models ?? []), ...preset.models])];
  if (preset.kind === "reconix") return saved ? [...saved.models] : [];
  return null;
}

/** The provider's name in the form's words ("OpenAI needs an API key."). */
const nameOf = (preset: Preset, saved: ProviderView | null) => (saved ? savedName(saved) : preset.label);

/** Why a fetch or Add model can't ask yet, or null (the server checks everything again). */
export function credentialsProblem(preset: Preset, saved: ProviderView | null, c: Credentials): string | null {
  const key = c.apiKey.trim();
  if (showsUrl(preset)) {
    const urlProblem = baseUrlProblem(c.baseUrl);
    if (urlProblem) return urlProblem;
  }
  if (key && !API_KEY_CHARS.test(key)) return "An API key is printable characters without spaces.";
  if (key && (key.length < MIN_KEY || key.length > MAX_KEY)) return `An API key must be ${MIN_KEY} to ${MAX_KEY} characters.`;
  const keyKept = Boolean(saved?.keySaved) && !c.removeKey;
  if (preset.key === "required" && !key && !keyKept) return `${nameOf(preset, saved)} needs an API key.`;
  return null;
}

/** What a fetch or a test asks: the saved provider by its id while its key is kept as saved
    (its key goes only to its saved address, which is this one), else the values here, with only
    the key typed here. */
export function probeOf(preset: Preset, saved: ProviderView | null, c: Credentials, model?: string): Probe {
  const baseUrl = addressOf(preset, c);
  const key = c.apiKey.trim();
  const withModel = model ? { model } : {};
  if (saved && sameAddress(baseUrl, saved.baseUrl) && !key && !c.removeKey) return { providerId: saved.id, ...withModel };
  return { baseUrl, ...withModel, ...(key ? { apiKey: key } : {}) };
}

/** A route's answer as the form reads it. */
export type Answer<T> = ({ ok: true } & T) | { ok: false; status: number; detail: string };

/** Where a fetch leaves the Model field: a list to choose from (`verify`: a model chosen from it
    is tested before it is saved), a test of a model the provider is known to have, or no list
    (the reason in the error style; `typeInstead`: the model's server answered without a list, so
    typing a model name can still go on). Only "not listed" leads to the test or to typing:
    anything else (never reached, a refused key, a limit…) has to be fixed first. */
export type FetchNext =
  | { next: "list"; models: string[]; note: string | null; verify: boolean }
  | { next: "test"; model: string }
  | { next: "stay"; error: string; typeInstead: boolean };
/** The Model field's list: what a fetch found. */
export type ModelList = Extract<FetchNext, { next: "list" }>;

const NOT_LISTED = "The server doesn't list its models: these are the ones saved.";
const NONE_LISTED = "The server lists no models: type the model's name.";

/** After the fetch route answered: its list, `listed: false` (the model's server answered, but
    without a list), or a failure. `known`: the saved provider's models. */
export function afterFetch(answer: Answer<FetchResult>, known: readonly string[]): FetchNext {
  if (!answer.ok) return { next: "stay", error: answer.detail, typeInstead: false };
  if ("models" in answer) return answer.models.length ? { next: "list", models: answer.models, note: null, verify: false } : { next: "list", models: [], note: NONE_LISTED, verify: true };
  if (known.length) return { next: "test", model: known[0] };
  return { next: "stay", error: answer.detail, typeInstead: true };
}

/** After the test route answered for a model the provider is known to have. */
export function afterTest(answer: Answer<{ result: { ok: boolean; detail: string } }>, known: readonly string[]): FetchNext {
  if (!answer.ok) return { next: "stay", error: answer.detail, typeInstead: false };
  if (!answer.result.ok) return { next: "stay", error: answer.result.detail, typeInstead: true };
  return { next: "list", models: [...known], note: NOT_LISTED, verify: false };
}

/** "Type a model name" instead (the server gave no list): nothing listed, the name tested. */
export const typeInstead = (): ModelList => ({ next: "list", models: [], note: NONE_LISTED, verify: true });

/** The Model select's two values that are no model name (a name has no spaces). */
export const NO_MODEL_YET = "";
export const TYPED = " typed";

/** The model a fetched list starts on: the saved provider's active one, else its first saved
    one, else the first listed; null: "Type a model name". */
export function initialChoice(models: readonly string[], saved: ProviderView | null, view: ModelsView): string | null {
  const active = saved && view.active?.providerId === saved.id ? view.active.model : null;
  for (const name of [active, ...(saved?.models ?? [])]) if (name && models.includes(name)) return name;
  return models[0] ?? null;
}

/** Why the Model field holds no usable name yet, or null. */
export function choiceProblem(choice: string, typed: string): string | null {
  if (choice === NO_MODEL_YET) return "Fetch the provider's models, or type a model name.";
  return choice === TYPED ? nameProblem(typed) : null;
}

/** A name no other saved provider has: the preset's, else with a number ("OpenAI 2"). */
export function freeName(label: string, providers: readonly ProviderView[]): string {
  const taken = new Set(providers.map((p) => p.name.toLowerCase()));
  if (!taken.has(label.toLowerCase())) return label;
  for (let n = 2; ; n++) {
    const name = `${label.slice(0, MAX_NAME - 4)} ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/** What "Add model" sends: a new provider made active, or the saved one's changes (none: only
    the switch) and the switch. A provider shown under another preset than it was saved with (a
    cloud one at another address: presetFor) is saved as that preset, Custom. */
export type AddRequests = { kind: "add"; body: AddProvider } | { kind: "update"; id: string; body: UpdateProvider | null; activate: SetActive };

export function requestsForAdd(
  preset: Preset,
  saved: ProviderView | null,
  view: ModelsView,
  c: Credentials,
  model: string,
): { ok: true; requests: AddRequests } | { ok: false; problem: string } {
  const baseUrl = addressOf(preset, c);
  const key = c.apiKey.trim();
  if (!saved) {
    const body: AddProvider = { name: freeName(preset.label, view.providers), preset: preset.id, baseUrl, models: [model], ...(key ? { apiKey: key } : {}), activate: true };
    return { ok: true, requests: { kind: "add", body } };
  }
  const added = !saved.models.includes(model);
  if (added && saved.models.length >= MAX_MODELS) return { ok: false, problem: `${saved.name} has ${MAX_MODELS} models saved already: remove one first.` };
  const body: UpdateProvider = {
    ...(preset.id !== saved.preset ? { preset: preset.id } : {}),
    ...(!sameAddress(baseUrl, saved.baseUrl) ? { baseUrl } : {}),
    ...(added ? { models: [...saved.models, model] } : {}),
    ...(key ? { apiKey: key } : c.removeKey && saved.keySaved ? { removeKey: true as const } : {}),
  };
  return { ok: true, requests: { kind: "update", id: saved.id, body: Object.keys(body).length ? body : null, activate: { providerId: saved.id, model } } };
}
