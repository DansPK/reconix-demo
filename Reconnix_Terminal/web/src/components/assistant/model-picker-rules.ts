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
import { API_KEY, MAX_MODELS, MAX_NAME } from "@/lib/assistant/models/schema";
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
    : `${model.name} (${model.provider}): a remote model. Questions, the assessment data they need and relevant /add-on knowledge passages are sent to it.`;
  return { label: model.name, name: `Model: ${model.name} (${from})`, title, tone: "success" };
}

// --- the list: your models -----------------------------------------------------------------------

export interface ModelRow {
  key: string; // "<providerId>/<model>"
  providerId: string;
  model: string;
  provider: string; // the provider's name as shown
  where: "local" | "remote";
  checked: boolean; // answers the next question
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

/** Every saved model, provider by provider in the order they were saved: ✓ on the one that
    answers next. */
export function modelRows(view: ModelsView): ModelRow[] {
  const active = view.active;
  return view.providers.flatMap((p) =>
    p.models.map((model) => ({
      key: `${p.id}/${model}`,
      providerId: p.id,
      model,
      provider: savedName(p),
      where: p.local ? ("local" as const) : ("remote" as const),
      checked: active?.providerId === p.id && active.model === model,
    })),
  );
}

/** What removing a row sends: the provider goes with its last model (DELETE, its key too),
    otherwise its list loses the model (PATCH). Null: the provider is not saved any more. */
export type RemoveRequest = { kind: "delete"; id: string } | { kind: "update"; id: string; body: UpdateProvider };

export function removeRequest(view: ModelsView, row: ModelRow): RemoveRequest | null {
  const p = view.providers.find((x) => x.id === row.providerId);
  if (!p) return null;
  const rest = p.models.filter((m) => m !== row.model);
  return rest.length ? { kind: "update", id: p.id, body: { models: rest } } : { kind: "delete", id: p.id };
}

/** The inline confirm's words: "Remove <model> (<provider>)?" and what follows from it. */
export function removeQuestion(view: ModelsView, row: ModelRow): { title: string; detail: string } {
  const title = `Remove ${row.model} (${row.provider})?`;
  const p = view.providers.find((x) => x.id === row.providerId);
  const rest = p ? p.models.filter((m) => m !== row.model) : [];
  if (rest.length) {
    const kept = `${row.provider} keeps its other models`;
    return { title, detail: row.checked ? `${kept}; ${rest[0]} answers instead.` : `${kept}.` };
  }
  const gone = `It is ${row.provider}'s last model, so ${row.provider}${p?.keySaved ? " and its saved API key are" : " is"} removed too.`;
  return { title, detail: row.checked ? `${gone} No model answers until you add or choose one.` : gone };
}

// --- the form: Set the provider --------------------------------------------------------------------

export interface ProviderOption {
  id: Preset["id"];
  label: string;
}

/** The preset's name in the list: "Ollama (local)", "Custom (OpenAI-compatible)". */
export const presetLabel = (preset: Preset) => (preset.kind === "local" ? `${preset.label} (local)` : preset.kind === "custom" ? "Custom (OpenAI-compatible)" : preset.label);

/** The Provider select: the presets in their order, every one usable (a cloud one sends the
    questions off this machine: the form says so under it). */
export const providerOptions = (): ProviderOption[] => PRESETS.map((p) => ({ id: p.id, label: presetLabel(p) }));

/** The provider the form starts on: the first local one (nothing leaves this machine until a
    cloud preset or a remote address is chosen). */
export const firstPreset = (): Preset => PRESETS.find((p) => p.kind === "local") ?? presetOf("custom");

/** Only Custom and the local presets take an address; a cloud preset's is fixed. */
export const showsUrl = (preset: Preset) => preset.kind !== "cloud";

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
  const na = normalAddress(a);
  return na !== null && na === normalAddress(b);
};

/** The saved provider "Add model" adds to: the one shown as this preset at this address (a cloud
    one is at the cloud's own address), or null (a new provider is saved). */
export const savedFor = (view: ModelsView, preset: Preset, address: string): ProviderView | null =>
  view.providers.find((p) => presetFor(p).id === preset.id && sameAddress(p.baseUrl, address)) ?? null;

/** The provider's name in the form's words ("OpenAI needs an API key."). */
const nameOf = (preset: Preset, saved: ProviderView | null) => (saved ? savedName(saved) : preset.label);

/** Why a fetch or Add model can't ask yet, or null (the server checks everything again). */
export function credentialsProblem(preset: Preset, saved: ProviderView | null, c: Credentials): string | null {
  const key = c.apiKey.trim();
  if (showsUrl(preset) && !c.baseUrl.trim()) return "Give the base URL (it usually ends in /v1).";
  if (key && !API_KEY.test(key)) return "An API key is printable characters without spaces.";
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
