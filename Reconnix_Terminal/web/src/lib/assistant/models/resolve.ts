/* Which model answers (server only): the model chosen in the model picker (models.json's active
   provider and model), checked again on every use by config.ts's rules: if it can't be used any
   more, the reason is reported and nothing else answers in its place. With nothing chosen, no
   model answers: the web reads none from its environment, every model is added with the
   composer's + Model. The page needs only the summary
   (`activeModelSummary`, which reads no API key); asking needs the whole model (`activeModel`).
   Also what the model picker's routes answer (`modelsView`) and the model a test or a fetch talks
   to (`probeTarget`): a saved key only ever goes to its provider's saved address. */
import "server-only";

import { checkAddress, checkModel, isLocal, type ModelConfig } from "../config";
import { MODELS_FAIL, ModelsError } from "./errors";
import type { Probe } from "./requests";
import { readChoice, readSaved, type Saved, viewOf } from "./store";
import type { ModelsFile, SavedProvider } from "./schema";
import type { ModelsView, ModelSummary } from "./view";

export type ActiveModel = { ok: true; config: ModelConfig; summary: ModelSummary } | { ok: false; reason: string; summary: ModelSummary };

export const NO_MODEL = "No AI model is set up yet. Add one with the model chip under the message box (+ Model).";

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const refused = (reason: string, name = "", provider = "", local = false): ActiveModel => ({
  ok: false,
  reason,
  summary: { configured: false, name: cut(name, 128), provider: cut(provider, 60), local, reason: cut(reason, 600) },
});

/** `keyOf`: the provider's API key (null: none), or throws why it can't be had. */
function resolveFrom(file: ModelsFile, keyOf: Saved["apiKeyOf"]): ActiveModel {
  const active = file.active;
  if (!active) return refused(NO_MODEL);
  const p = file.providers.find((x) => x.id === active.providerId)!; // store.ts checked it is there
  let apiKey: string | null;
  try {
    apiKey = keyOf(p);
  } catch (error) {
    return refused(`${p.name}: ${error instanceof ModelsError ? error.message : MODELS_FAIL.sealed}`, active.model, p.name, isLocal(p.baseUrl));
  }
  const checked = checkModel({ baseUrl: p.baseUrl, model: active.model, apiKey });
  if (!checked.ok) return refused(`${p.name}: ${checked.reason}`, active.model, p.name, isLocal(p.baseUrl));
  return { ok: true, config: checked.config, summary: { configured: true, name: active.model, provider: p.name, local: checked.config.local, reason: "" } };
}

/** The model that answers the next question, or why there is none. Never throws. */
export async function activeModel(): Promise<ActiveModel> {
  let saved: Saved;
  try {
    saved = await readSaved();
  } catch (error) {
    return refused(error instanceof ModelsError ? error.message : MODELS_FAIL.read);
  }
  return resolveFrom(saved.file, saved.apiKeyOf);
}

/** Stands in for a saved key that is there but not opened: the rules only ask whether there is
    one (a key goes only over https to a remote model), and this summary never calls the model. */
const UNOPENED = "unopened";

/** Only the summary of activeModel, for the page (every render, and the live refresh): the same
    rules and reasons, but no API key is read or opened (models.key is checked without reading
    it). A sealed key that no longer opens with an intact models.key shows up when a question is
    asked, and in the model picker. Never throws. */
export async function activeModelSummary(): Promise<ModelSummary> {
  let choice: { file: ModelsFile; keyFile: boolean };
  try {
    choice = await readChoice();
  } catch (error) {
    return refused(error instanceof ModelsError ? error.message : MODELS_FAIL.read).summary;
  }
  const keyOf = (p: SavedProvider) => {
    if (!p.key) return null;
    if (!choice.keyFile) throw new ModelsError(MODELS_FAIL.sealed); // as readSaved().apiKeyOf
    return UNOPENED;
  };
  return resolveFrom(choice.file, keyOf).summary;
}

/** What the model picker shows: the saved providers (no keys), the choice and the summary.
    Throws a ModelsError when the saved models can't be read. */
export async function modelsView(): Promise<ModelsView> {
  const saved = await readSaved();
  return {
    providers: saved.file.providers.map(viewOf),
    active: saved.file.active,
    summary: resolveFrom(saved.file, saved.apiKeyOf).summary,
  };
}

/** The model a test or a fetch talks to: a saved provider as saved (its key to its own address
    only), or unsaved values (only the key typed with them). `needsModel`: a test needs a model
    name, a fetch doesn't. */
export async function probeTarget(probe: Probe, needsModel: boolean): Promise<ModelConfig> {
  if ("providerId" in probe) {
    const { file, apiKeyOf } = await readSaved();
    const p = file.providers.find((x) => x.id === probe.providerId);
    if (!p) throw new ModelsError("That provider is not saved any more.", 404);
    const model = probe.model ?? p.models[0];
    const checked = checkModel({ baseUrl: p.baseUrl, model, apiKey: apiKeyOf(p) });
    if (!checked.ok) throw new ModelsError(checked.reason, 400);
    return checked.config;
  }
  if (needsModel && !probe.model) throw new ModelsError("Name a model to test.", 400);
  const apiKey = probe.apiKey ?? null;
  if (!probe.model) {
    const address = checkAddress({ baseUrl: probe.baseUrl, apiKey });
    if (!address.ok) throw new ModelsError(address.reason, 400);
    return { baseUrl: address.baseUrl, model: "", apiKey, local: address.local };
  }
  const checked = checkModel({ baseUrl: probe.baseUrl, model: probe.model, apiKey });
  if (!checked.ok) throw new ModelsError(checked.reason, 400);
  return checked.config;
}
