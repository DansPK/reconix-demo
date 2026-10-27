"use client";

/* The model picker's "Set the provider" (+ Model in the list): Provider, a native select of the
   presets in order (it starts on the first local one; a cloud one says where the questions go,
   under it); Base URL (Custom and the local presets only, filled in from the preset); API key
   (model-key-field.tsx: never controlled, never kept); Model (model-name-field.tsx: the list
   Fetch models brings, or a typed name); Cancel / Add model. Choosing a provider empties the key
   field and, when it needs nothing more (a local preset), fetches its models; so does leaving the
   address or the key for another control of the form once they changed; Enter in either is Fetch
   models. A fetch asks the saved provider by its id while it is the same preset at the same
   address with its key kept (its key goes only to its saved address), else the values typed
   here; when the model's server answers without a list, a model the saved provider is known to
   have is tested instead. Add model checks what the form holds, tests the model unless it came
   from the list fetched for exactly these values, then saves: a new provider (POST, made active)
   or, when that preset at that address is saved already, the model added to it (PATCH) and a
   switch to it (PUT); the picker then closes and the chip names the model. A refusal stays here,
   in the error style ("Type a model name instead" when the server only failed to list its
   models). An answer that comes back after the form changed or went is dropped. */
import { useEffect, useId, useRef, useState } from "react";
import { Loader } from "lucide-react";

import * as api from "@/lib/assistant/client";
import { type PresetId, presetOf } from "@/lib/assistant/models/presets";
import { MAX_URL } from "@/lib/assistant/models/schema";
import type { ModelsView } from "@/lib/assistant/models/view";
import { ModelKeyField, NOT_A_LOGIN } from "./model-key-field";
import { type ListState, ModelNameField } from "./model-name-field";
import {
  addressOf,
  afterFetch,
  afterTest,
  choiceProblem,
  type Credentials,
  credentialsProblem,
  firstPreset,
  initialChoice,
  NO_MODEL_YET,
  normalAddress,
  probeOf,
  providerOptions,
  requestsForAdd,
  savedFor,
  savedName,
  showsUrl,
  TYPED,
  typeInstead,
} from "./model-picker-rules";
import type { Models } from "./use-models";

interface Props {
  view: ModelsView;
  models: Models;
  onCancel: () => void;
  onDone: () => void;
}

/** The values a fetch or Add model reads (the key comes from its field). */
interface Values {
  presetId: PresetId;
  baseUrl: string;
  removeKey: boolean;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

export function ModelProviderForm({ view, models, onCancel, onDone }: Props) {
  const id = useId();
  const ids = { provider: `${id}-provider`, providerHint: `${id}-provider-hint`, url: `${id}-url`, urlHint: `${id}-url-hint`, key: `${id}-key`, model: `${id}-model` };
  const root = useRef<HTMLDivElement>(null);
  const providerField = useRef<HTMLSelectElement>(null);
  const keyField = useRef<HTMLInputElement>(null);
  const typedField = useRef<HTMLInputElement>(null);
  const [presetId, setPresetId] = useState<PresetId>(() => firstPreset().id);
  const [baseUrl, setBaseUrl] = useState<string>(() => firstPreset().baseUrl);
  const [removeKey, setRemoveKey] = useState(false);
  const [keyTyped, setKeyTyped] = useState(false);
  const [list, setList] = useState<ListState>({ status: "none" });
  const [choice, setChoice] = useState(NO_MODEL_YET);
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ text: string; typeInstead: boolean } | null>(null);
  const keyVersion = useRef(0); // bumped on every change of the key field (never the key itself)
  const asked = useRef(0); // the latest fetch: an older answer is dropped
  const tried = useRef<string | null>(null); // what the last fetch asked about
  const inFlight = useRef<string | null>(null); // what the fetch on its way asks about
  const focusTyped = useRef(false);
  const alive = useRef(true);

  const preset = presetOf(presetId);
  const address = addressOf(preset, { baseUrl });
  const saved = savedFor(view, preset, address);
  const keySaved = Boolean(saved?.keySaved);
  const providerName = saved ? savedName(saved) : preset.label;
  const host = hostOf(address);
  const remote = host !== null && !LOOPBACK.has(host);

  useEffect(() => {
    providerField.current?.focus({ preventScroll: true }); // the form's first control
    alive.current = true;
    return () => {
      alive.current = false; // gone (Cancel, Escape, closed) while asking: the answer is dropped
    };
  }, []);
  useEffect(() => {
    if (!focusTyped.current || !typedField.current) return;
    focusTyped.current = false;
    typedField.current.focus({ preventScroll: true });
  });

  /** The form's values with the key read from its field, as the rules take them. */
  const read = (v: Values) => {
    const p = presetOf(v.presetId);
    const s = savedFor(view, p, addressOf(p, v));
    const c: Credentials = { baseUrl: v.baseUrl, apiKey: keyField.current?.value ?? "", removeKey: v.removeKey && Boolean(s?.keySaved) };
    const where = addressOf(p, v);
    return { preset: p, saved: s, c, sig: `${v.presetId}|${normalAddress(where) ?? where}|${keyVersion.current}|${c.removeKey}` };
  };
  const now = (): Values => ({ presetId, baseUrl, removeKey });

  /** Fetch models; `auto`: the form's own, which asks only what wasn't asked yet and says
      nothing when something is still missing. */
  const fetchList = async (v: Values, auto: boolean) => {
    const { preset: p, saved: s, c, sig } = read(v);
    const problem = credentialsProblem(p, s, c);
    if (problem) {
      if (!auto) setError({ text: problem, typeInstead: false });
      return;
    }
    if (inFlight.current === sig || (auto && tried.current === sig)) return;
    tried.current = sig;
    inFlight.current = sig;
    const n = ++asked.current;
    setError(null);
    setList({ status: "loading" });
    const known = s?.models ?? [];
    let next = afterFetch(await api.fetchModelNames(probeOf(p, s, c)), known);
    if (next.next === "test" && n === asked.current && alive.current) next = afterTest(await api.testModel(probeOf(p, s, c, next.model)), known);
    if (n !== asked.current || !alive.current) return;
    inFlight.current = null;
    if (next.next === "list") {
      const found = next;
      setList({ status: "ready", sig, ...found });
      // a model chosen, or a name being typed, stays; otherwise the list's first choice
      setChoice((was) => (was === TYPED || found.models.includes(was) ? was : found.models.length ? (initialChoice(found.models, s, view) ?? TYPED) : TYPED));
    } else if (next.next === "stay") {
      setList({ status: "none" });
      setChoice((was) => (was === TYPED ? was : NO_MODEL_YET));
      setError({ text: next.error, typeInstead: next.typeInstead });
    }
  };

  const choosePreset = (next: PresetId) => {
    const p = presetOf(next);
    if (keyField.current) keyField.current.value = ""; // a key typed for one provider never goes to another
    keyVersion.current += 1;
    asked.current += 1; // a fetch on its way was for the provider before
    inFlight.current = null;
    setKeyTyped(false);
    setPresetId(next);
    setBaseUrl(p.baseUrl);
    setRemoveKey(false);
    setList({ status: "none" });
    setChoice(NO_MODEL_YET);
    setError(null);
    void fetchList({ presetId: next, baseUrl: p.baseUrl, removeKey: false }, true);
  };

  /** Leaving the address or the key for another control of this form fetches what it can (not
      for Cancel or Add model, nor outside the form). */
  const onLeave = (e: React.FocusEvent) => {
    const to = e.relatedTarget;
    if (!(to instanceof HTMLElement) || !root.current?.contains(to) || to.dataset.noFetch !== undefined) return;
    void fetchList(now(), true);
  };
  const fetchOnEnter = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void fetchList(now(), false);
  };

  const add = async () => {
    if (saving) return;
    const { c, sig } = read(now());
    const problem = credentialsProblem(preset, saved, c) ?? choiceProblem(choice, typed);
    if (problem) return setError({ text: problem, typeInstead: false });
    const model = choice === TYPED ? typed.trim() : choice;
    const built = requestsForAdd(preset, saved, view, c, model);
    if (!built.ok) return setError({ text: built.problem, typeInstead: false });
    const listedHere = choice !== TYPED && list.status === "ready" && !list.verify && list.sig === sig;
    setSaving(true);
    setError(null);
    if (!listedHere) {
      const tested = await api.testModel(probeOf(preset, saved, c, model));
      const failed = !tested.ok ? tested.detail : tested.result.ok ? null : tested.result.detail;
      if (!alive.current) return;
      if (failed) {
        setSaving(false);
        return setError({ text: failed, typeInstead: false });
      }
    }
    const refused = await models.save(built.requests);
    if (!alive.current) return;
    setSaving(false);
    if (refused) setError({ text: refused, typeInstead: false });
    else onDone();
  };

  return (
    <div ref={root} className="ai-picker-form">
      <div className="ai-picker-body ai-picker-fields">
        <div className="ai-field">
          <label htmlFor={ids.provider} className="ai-label">
            Provider
          </label>
          <select ref={providerField} id={ids.provider} value={presetId} onChange={(e) => choosePreset(e.target.value as PresetId)} aria-describedby={ids.providerHint} className="ai-select">
            {providerOptions().map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <div id={ids.providerHint} className="flex flex-col gap-1">
            {!showsUrl(preset) && (
              <p className="ai-hint">
                {preset.label} runs at {host}: your questions, the assessment data they need and relevant /add-on knowledge passages are sent there.
              </p>
            )}
            {saved && <p className="ai-hint">Saved as {providerName}: Add model adds the model to it.</p>}
          </div>
        </div>
        {showsUrl(preset) && (
          <div className="ai-field">
            <label htmlFor={ids.url} className="ai-label">
              Base URL
            </label>
            <input
              id={ids.url}
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setError(null);
              }}
              onKeyDown={fetchOnEnter}
              onBlur={onLeave}
              maxLength={MAX_URL}
              inputMode="url"
              spellCheck={false}
              {...NOT_A_LOGIN}
              placeholder="http://127.0.0.1:8000/v1"
              aria-describedby={ids.urlHint}
              className="ai-input ai-mono"
            />
            <p id={ids.urlHint} className="ai-hint">
              {remote
                ? "Off this machine: your questions, the assessment data they need and relevant /add-on knowledge passages are sent there."
                : "An OpenAI-compatible address, usually ending in /v1."}
            </p>
          </div>
        )}
        <ModelKeyField
          id={ids.key}
          inputRef={keyField}
          provider={providerName}
          required={preset.key === "required"}
          keySaved={keySaved}
          removeKey={removeKey}
          keyTyped={keyTyped}
          onTyped={(typedNow) => {
            keyVersion.current += 1;
            setKeyTyped(typedNow);
            setError(null);
          }}
          onRemoveKey={(remove) => {
            setRemoveKey(remove);
            setError(null);
          }}
          onKeyDown={fetchOnEnter}
          onBlur={onLeave}
        />
        <ModelNameField
          id={ids.model}
          list={list}
          choice={choice}
          typed={typed}
          typedRef={typedField}
          onChoice={(value) => {
            setChoice(value);
            setError(null);
          }}
          onTyped={(value) => {
            setTyped(value);
            setError(null);
          }}
          onFetch={() => void fetchList(now(), false)}
          onSubmit={() => void add()}
        />
        {error && (
          <div className="ai-picker-refusal" role="alert">
            <p>{error.text}</p>
            {error.typeInstead && (
              <button
                type="button"
                onClick={() => {
                  focusTyped.current = true;
                  setList({ status: "ready", sig: read(now()).sig, ...typeInstead() });
                  setChoice(TYPED);
                  setError(null);
                }}
                className="ai-btn ai-btn-small ai-btn-outline mt-2"
              >
                Type a model name instead
              </button>
            )}
          </div>
        )}
      </div>
      <div className="ai-picker-foot">
        <button type="button" data-no-fetch onClick={onCancel} className="ai-btn ai-btn-small ai-btn-outline">
          Cancel
        </button>
        <button type="button" data-no-fetch onClick={() => void add()} disabled={saving} className="ai-btn ai-btn-small ai-btn-primary">
          {saving && <Loader className="size-3.5 animate-spin" aria-hidden />}
          Add model
        </button>
      </div>
    </div>
  );
}
