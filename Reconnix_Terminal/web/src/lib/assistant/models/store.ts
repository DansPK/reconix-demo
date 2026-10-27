/* The saved models (server only): models.json in the assistant's folder (secure-fs.ts: the folder
   0700, the file 0600, written atomically through the shared queue, read without following a
   link). It holds the providers the model picker added and the active choice; an API key is sealed
   with models/crypto.ts before it is written and is opened only for the request it is used in.
   Nothing here returns a key to a route except `readSaved().apiKeyOf`, which the server uses to
   call the model. A file that doesn't parse, or whose active choice names no saved model, is
   refused with a fixed error (never silently replaced). Every change re-checks its values:
   names cleaned, addresses through config.ts's rules, a cloud preset only at its own address
   (presets.ts `fitsPreset`), a saved key kept only while the address stays on the same host. */
import "server-only";

import { randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import path from "node:path";

import { checkAddress, isLocal } from "../config";
import { cleanTitle } from "../history-schema";
import { assistantDir, code, type Folder, inFolder, openFolder, readText, serial, tempSuffix, writeAtomic } from "../secure-fs";
import { ensureKey, hasKey, open, readKey, seal } from "./crypto";
import { folderFault, MODELS_FAIL, ModelsError } from "./errors";
import { CLOUD_FIXED, fitsPreset, type PresetId, presetOf } from "./presets";
import type { AddProvider, UpdateProvider } from "./requests";
import { type Active, EMPTY_MODELS, MAX_FILE_BYTES, MAX_NAME, MAX_PROVIDERS, type ModelsFile, ModelsFileSchema, type SavedProvider } from "./schema";
import type { ProviderView } from "./view";

export const MODELS_FILE = "models.json";
/** A write of models.json that never finished (history-store.ts prunes them once stale). */
export const MODELS_TEMP = /^\.models\.[0-9a-f]{12}\.tmp$/;
export const modelsTempName = () => `.models.${tempSuffix()}.tmp`;

// --- reading -------------------------------------------------------------------------------------

/** The file, checked: the schema, one entry per id, and an active choice that is saved. */
function parse(text: string): ModelsFile {
  let file: ModelsFile;
  try {
    file = ModelsFileSchema.parse(JSON.parse(text));
  } catch {
    throw new ModelsError(MODELS_FAIL.read);
  }
  const ids = new Set(file.providers.map((p) => p.id));
  const chosen = file.active && file.providers.find((p) => p.id === file.active?.providerId);
  if (ids.size !== file.providers.length || (file.active && !chosen?.models.includes(file.active.model))) throw new ModelsError(MODELS_FAIL.read);
  return file;
}

async function readFile(f: Folder): Promise<ModelsFile> {
  const full = path.join(f.dir, MODELS_FILE);
  const text = await readText(full, MAX_FILE_BYTES);
  if (text !== null) return parse(text);
  const info = await lstat(/*turbopackIgnore: true*/ full).catch((error) => (code(error) === "ENOENT" ? null : error));
  if (info === null) return EMPTY_MODELS; // nothing saved yet
  throw new ModelsError(MODELS_FAIL.read); // a link, a folder, too big, unreadable
}

export interface Saved {
  file: ModelsFile;
  /** The provider's API key, opened for one request (null: it has none). Throws a fixed error
      when it can't be opened. */
  apiKeyOf: (p: SavedProvider) => string | null;
}

/** `read` on the open folder, or `none` when there is no folder (it is never made here). */
async function fromFolder<T>(none: T, read: (f: Folder) => Promise<T>): Promise<T> {
  const dir = assistantDir();
  const exists = await lstat(/*turbopackIgnore: true*/ dir).then(
    () => true,
    (error) => (code(error) === "ENOENT" ? false : Promise.reject(new ModelsError(MODELS_FAIL.folder))),
  );
  if (!exists) return none;
  const f = await openFolder(dir, folderFault);
  try {
    return await read(f);
  } finally {
    await f.handle?.close().catch(() => {});
  }
}

/** What is saved, without making the folder when there is none. */
export function readSaved(): Promise<Saved> {
  return fromFolder<Saved>({ file: EMPTY_MODELS, apiKeyOf: () => null }, async (f) => {
    const file = await readFile(f);
    const key = file.providers.some((p) => p.key) ? await readKey(f) : null;
    return {
      file,
      apiKeyOf: (p) => {
        if (!p.key) return null;
        if (!key) throw new ModelsError(MODELS_FAIL.sealed);
        return open(p.key, key, p.id);
      },
    };
  });
}

/** What is saved, for saying which model answers: the file, and whether there is a models.key
    for its sealed keys (checked as readSaved checks it, throwing the same errors), but no key is
    read or opened. */
export function readChoice(): Promise<{ file: ModelsFile; keyFile: boolean }> {
  return fromFolder({ file: EMPTY_MODELS, keyFile: false }, async (f) => {
    const file = await readFile(f);
    return { file, keyFile: file.providers.some((p) => p.key) ? await hasKey(f) : false };
  });
}

/** A saved provider as the browser may see it: never the key, only whether one is saved. */
export const viewOf = (p: SavedProvider): ProviderView => ({
  id: p.id,
  name: p.name,
  preset: p.preset,
  baseUrl: p.baseUrl,
  models: p.models,
  keySaved: Boolean(p.key),
  local: isLocal(p.baseUrl),
});

/** The saved providers (without keys) and the active choice. */
export async function listProviders(): Promise<{ providers: ProviderView[]; active: Active | null }> {
  const { file } = await readSaved();
  return { providers: file.providers.map(viewOf), active: file.active };
}

// --- changing ------------------------------------------------------------------------------------

/** One change: read, change, check, write, all in the shared queue. A change that would make
    the file bigger than it may be read back is refused (400), so it is never written. */
function change<T>(task: (file: ModelsFile, f: Folder) => Promise<{ file: ModelsFile; result: T }>): Promise<T> {
  return serial(() =>
    inFolder(assistantDir(), folderFault, async (f) => {
      const { file, result } = await task(await readFile(f), f);
      let data: string;
      try {
        data = JSON.stringify(ModelsFileSchema.parse(file));
      } catch {
        throw new ModelsError(MODELS_FAIL.save);
      }
      if (Buffer.byteLength(data, "utf8") > MAX_FILE_BYTES) throw new ModelsError(MODELS_FAIL.full, 400);
      await writeAtomic(f, MODELS_FILE, modelsTempName(), data, folderFault, () => new ModelsError(MODELS_FAIL.save));
      return result;
    }),
  );
}

const bad = (message: string) => new ModelsError(message, 400);
const GONE = "That provider is not saved any more.";

/** A provider's name: masked, one line, at most MAX_NAME; unique. */
function nameFor(raw: string, file: ModelsFile, self: string | null): string {
  const name = cleanTitle(raw, MAX_NAME);
  if (!name) throw bad("Give the provider a name.");
  if (file.providers.some((p) => p.id !== self && p.name.toLowerCase() === name.toLowerCase())) throw bad("A provider with that name is saved already.");
  return name;
}

/** The address, checked and normalized; `withKey`: a key will be sent to it. */
function addressFor(baseUrl: string, withKey: boolean): string {
  const checked = checkAddress({ baseUrl, apiKey: withKey ? "key" : null });
  if (!checked.ok) throw bad(checked.reason);
  return checked.baseUrl;
}

/** A cloud preset names its own address only (the origin of its base URL): another address is
    saved as Custom. */
function checkPreset(preset: PresetId, baseUrl: string): void {
  if (!fitsPreset(presetOf(preset), baseUrl)) throw bad(CLOUD_FIXED);
}

const hostOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};

/** Adds a provider; `activate` makes its first model the one that answers. */
export function addProvider(input: AddProvider): Promise<ProviderView> {
  return change(async (file, f) => {
    if (file.providers.length >= MAX_PROVIDERS) throw bad(`At most ${MAX_PROVIDERS} providers can be saved. Remove one first.`);
    const name = nameFor(input.name, file, null);
    const baseUrl = addressFor(input.baseUrl, Boolean(input.apiKey));
    checkPreset(input.preset, baseUrl);
    const id = randomUUID();
    const provider: SavedProvider = { id, name, preset: input.preset, baseUrl, models: input.models };
    if (input.apiKey) provider.key = seal(input.apiKey, await ensureKey(f, folderFault), id);
    const active = input.activate ? { providerId: id, model: input.models[0] } : file.active;
    return { file: { ...file, providers: [...file.providers, provider], active }, result: viewOf(provider) };
  });
}

/** Changes a saved provider (null: there is none). No `apiKey` keeps the saved key, unless the
    address moves to another host: then it must be entered again (or removed). A change of the
    preset or the address is checked against the preset (a cloud one at its own address only; a
    provider saved before that rule keeps working until either changes). When the active model
    leaves the list, the provider's first model takes its place. */
export function updateProvider(id: string, patch: UpdateProvider): Promise<ProviderView | null> {
  return change(async (file, f) => {
    const at = file.providers.findIndex((p) => p.id === id);
    if (at < 0) throw new ModelsError(GONE, 404);
    const old = file.providers[at];
    const keep = Boolean(old.key) && !patch.apiKey && !patch.removeKey;
    const nextUrl = patch.baseUrl ?? old.baseUrl;
    if (keep && hostOf(nextUrl) !== hostOf(old.baseUrl)) throw bad("The address moved to another host: enter the API key again, or remove the saved key.");
    const provider: SavedProvider = {
      id,
      name: patch.name === undefined ? old.name : nameFor(patch.name, file, id),
      preset: patch.preset ?? old.preset,
      baseUrl: addressFor(nextUrl, keep || Boolean(patch.apiKey)),
      models: patch.models ?? old.models,
    };
    if (patch.preset !== undefined || patch.baseUrl !== undefined) checkPreset(provider.preset, provider.baseUrl);
    if (patch.apiKey) provider.key = seal(patch.apiKey, await ensureKey(f, folderFault), id);
    else if (keep) provider.key = old.key;
    let active = file.active;
    if (active?.providerId === id && !provider.models.includes(active.model)) active = { providerId: id, model: provider.models[0] };
    const providers = file.providers.map((p, i) => (i === at ? provider : p));
    return { file: { ...file, providers, active }, result: viewOf(provider) };
  }).catch((error) => (error instanceof ModelsError && error.status === 404 ? null : Promise.reject(error)));
}

/** Removes a saved provider and its key (false: there was none). The active choice goes with it
    (no model answers until another is chosen). */
export function removeProvider(id: string): Promise<boolean> {
  return change(async (file) => {
    if (!file.providers.some((p) => p.id === id)) throw new ModelsError(GONE, 404);
    const active = file.active?.providerId === id ? null : file.active;
    return { file: { ...file, providers: file.providers.filter((p) => p.id !== id), active }, result: true };
  }).catch((error) => (error instanceof ModelsError && error.status === 404 ? false : Promise.reject(error)));
}

/** Makes a saved provider's model the one that answers (it must be listed and its address
    usable now). */
export function setActive(choice: Active): Promise<void> {
  return change(async (file) => {
    const p = file.providers.find((x) => x.id === choice.providerId);
    if (!p) throw new ModelsError(GONE, 404);
    if (!p.models.includes(choice.model)) throw bad("That model is not in the provider's list.");
    addressFor(p.baseUrl, Boolean(p.key));
    return { file: { ...file, active: choice }, result: undefined };
  });
}
