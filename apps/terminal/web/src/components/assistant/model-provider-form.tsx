"use client";

/* The model picker's "Set the provider" (+ Model in the list), as the TUI's /provider asks it:
   Provider (the TUI's list, Reconix first); Base URL (Ollama and Custom only); API key (not for
   Reconix or Ollama; model-key-field.tsx: never controlled, never kept); Model, a list only:
   Test connection beside it saves a new provider (not active), checks it through the Core API
   and lists its models (lib/api/models.ts `connect`), so no name is ever typed; Cancel / Add
   model. A saved provider shows its model at once. Add model makes the chosen model the
   provider's and makes it active; Cancel removes a provider this form saved and never added.
   Changing the provider, the address or the key asks for a new test. A refusal stays here, in
   the error style. An answer that comes back after the form went is dropped. */
import { useEffect, useId, useRef, useState } from "react";
import { CircleCheck, Loader, PlugZap, Plus, RefreshCw } from "lucide-react";

import { toast } from "@/components/ui/toast";
import * as api from "@/lib/assistant/client";
import { type PresetId, presetOf } from "@/lib/assistant/models/presets";
import { MAX_URL } from "@/lib/assistant/models/schema";
import { NEEDS_APPROVAL, type ModelsView, type ProviderView } from "@/lib/assistant/models/view";
import { ModelKeyField, NOT_A_LOGIN } from "./model-key-field";
import { nameProblem } from "./model-name-rules";
import { ProviderTiles } from "./provider-tiles";
import { type ListState, ModelNameField } from "./model-name-field";
import {
  addressOf,
  type Credentials,
  credentialsProblem,
  firstPreset,
  freeName,
  initialChoice,
  knownModels,
  NO_MODEL_YET,
  presetFor,
  requestsForAdd,
  savedFor,
  savedName,
  showsKey,
  showsUrl,
} from "./model-picker-rules";
import type { Models } from "./use-models";

interface Props {
  view: ModelsView;
  models: Models;
  onCancel: () => void;
  onDone: () => void;
  /** The provider the form starts on (a provider picked in the list), else Reconix. */
  start?: PresetId;
  /** Exact endpoint address when opening from an endpoint card's Edit button. */
  startBaseUrl?: string;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "host.docker.internal"]);
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

/** What the Model list holds before a test: a saved provider's models, else nothing. */
function listOf(preset: ReturnType<typeof presetOf>, saved: ProviderView | null): ListState {
  if (!saved) return { status: "none" };
  const models = knownModels(preset, saved) ?? [...saved.models];
  return { status: "ready", sig: "", next: "list", models, note: null, verify: false };
}

const firstOf = (list: ListState) => (list.status === "ready" ? (list.models[0] ?? NO_MODEL_YET) : NO_MODEL_YET);

export function ModelProviderForm({ view, models, onCancel, onDone, start, startBaseUrl }: Props) {
  const first = start ? presetOf(start) : firstPreset();
  const initialUrl = startBaseUrl || first.baseUrl;
  const initialSaved = savedFor(view, first, addressOf(first, { baseUrl: initialUrl }));
  const id = useId();
  const ids = { provider: `${id}-provider`, providerHint: `${id}-provider-hint`, url: `${id}-url`, urlHint: `${id}-url-hint`, key: `${id}-key`, model: `${id}-model` };
  const providerField = useRef<HTMLDivElement>(null);
  const keyField = useRef<HTMLInputElement>(null);
  const [presetId, setPresetId] = useState<PresetId>(() => first.id);
  const [baseUrl, setBaseUrl] = useState<string>(() => initialUrl);
  const [removeKey, setRemoveKey] = useState(false);
  const [keyTyped, setKeyTyped] = useState(false);
  const [list, setList] = useState<ListState>(() => listOf(first, initialSaved));
  const [choice, setChoice] = useState(() => firstOf(listOf(first, initialSaved)));
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tested, setTested] = useState<string | null>(null); // a passed test, in words
  const [error, setError] = useState<string | null>(null);
  const created = useRef<string | null>(null); // a provider Test connection saved, not added yet
  const discardRef = useRef(models.discard);
  const alive = useRef(true);

  useEffect(() => {
    discardRef.current = models.discard;
  }, [models.discard]);

  const preset = presetOf(presetId);
  const address = addressOf(preset, { baseUrl });
  const saved = savedFor(view, preset, address);
  const keySaved = Boolean(saved?.keySaved);
  const providerName = saved ? savedName(saved) : preset.label;
  const host = hostOf(address);
  const remote = host !== null && !LOOPBACK.has(host);
  const manual = list.status === "ready" && list.models.length === 0;
  const ready = list.status === "ready" && (list.models.length > 0 || manual); // a model to add: tested, manual, or saved before

  // Sync Phase 2 auto-loaded models into an open form if the user opened it before probing finished.
  const savedKey = saved ? `${saved.id}:${saved.models.join("\0")}` : "";
  const [syncedKey, setSyncedKey] = useState(savedKey);
  if (savedKey !== syncedKey) {
    setSyncedKey(savedKey);
    if (!testing && !tested && saved) {
      const nextList = listOf(preset, saved);
      setList(nextList);
      setChoice((was) => (nextList.status === "ready" && nextList.models.includes(was) ? was : firstOf(nextList)));
    }
  }

  const discardCreated = () => {
    const leftover = created.current;
    created.current = null;
    if (leftover) void discardRef.current(leftover);
  };

  useEffect(() => {
    providerField.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true }); // the form's first control
    alive.current = true;
    return () => {
      alive.current = false; // gone (Cancel, Escape, Back, Close, outside click): drop any unsaved test row
      discardCreated();
    };
  }, []);

  const credentials = (): Credentials => ({ baseUrl, apiKey: keyField.current?.value ?? "", removeKey: removeKey && keySaved });

  /** The list as it is before a test (for `p` saved as `s`): any change asks for a new test. */
  const reset = (p: ReturnType<typeof presetOf>, s: ProviderView | null) => {
    const l = listOf(p, s);
    setList(l);
    setChoice(firstOf(l));
    setTested(null);
    setError(null);
  };

  const choosePreset = (next: PresetId) => {
    const p = presetOf(next);
    discardCreated();
    if (keyField.current) keyField.current.value = ""; // a key typed for one provider never goes to another
    setKeyTyped(false);
    setPresetId(next);
    setBaseUrl(p.baseUrl);
    setRemoveKey(false);
    reset(p, savedFor(view, p, addressOf(p, { baseUrl: p.baseUrl })));
  };

  /** Test connection: save the provider if new (not active), check it, list its models. */
  const testConnection = async () => {
    if (testing || saving) return;
    const c = credentials();
    const problem = credentialsProblem(preset, saved, c);
    if (problem) return setError(problem);
    const key = c.apiKey.trim();
    if (!saved) discardCreated();
    setTesting(true);
    setTested(null);
    setError(null);
    setList({ status: "loading" });
    // a saved provider is tested as saved: a new or removed key is saved to it first
    if (saved && (key || c.removeKey)) {
      const updated = await api.updateModelProvider(saved.id, key ? { apiKey: key } : { removeKey: true });
      if (!alive.current) return;
      if (!updated.ok) {
        setTesting(false);
        setList(listOf(preset, saved));
        return setError(updated.detail);
      }
      models.accept(updated.view);
    }
    const answer = await api.connectModel({
      name: freeName(preset.label, view.providers),
      preset: preset.id,
      baseUrl: address,
      ...(saved ? { providerId: saved.id } : key ? { apiKey: key } : {}),
    });
    if (!alive.current) return;
    setTesting(false);
    if (!answer.ok) {
      setList(listOf(preset, saved));
      return setError(answer.detail);
    }
    models.accept(answer.view);
    if (answer.created) created.current = answer.providerId;
    if (keyField.current) keyField.current.value = ""; // saved now: never kept here
    setKeyTyped(false);
    setRemoveKey(false);
    const now = answer.view.providers.find((p) => p.id === answer.providerId) ?? null;
    if (answer.models.length === 0) {
      setList({ status: "ready", sig: "", next: "list", models: [], note: answer.detail, verify: true });
      setChoice((was) => (was && !nameProblem(was) ? was : ""));
    } else {
      setList({ status: "ready", sig: "", next: "list", models: answer.models, note: null, verify: false });
      setChoice((was) => (answer.models.includes(was) ? was : (initialChoice(answer.models, now, answer.view) ?? NO_MODEL_YET)));
    }
    setTested(answer.detail);
    toast(`${providerName}: ${answer.detail}`);
  };

  const add = async () => {
    if (saving) return;
    const chosenModel = manual ? choice.trim() : choice;
    if (manual) {
      const problem = nameProblem(chosenModel);
      if (problem) return setError(problem);
    } else if (!saved || list.status !== "ready" || chosenModel === NO_MODEL_YET) {
      return setError("Test connection first, then choose one of the models it finds.");
    }
    const c = credentials();
    if (c.apiKey.trim()) {
      const problem = credentialsProblem(preset, saved, c);
      if (problem) return setError(problem);
    }
    const built = requestsForAdd(preset, saved, view, c, chosenModel);
    if (!built.ok) return setError(built.problem);
    setSaving(true);
    setError(null);
    const refused = await models.save(built.requests);
    if (!alive.current) return;
    setSaving(false);
    if (refused) {
      if (refused === NEEDS_APPROVAL) created.current = null; // saved and waiting for TUI approval
      return setError(refused);
    }
    created.current = null; // added: it stays
    onDone();
  };

  const cancel = () => {
    discardCreated(); // saved by Test connection, never added
    onCancel();
  };

  const testOnEnter = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void testConnection();
  };

  return (
    <div className="ai-picker-form">
      <div className="ai-picker-body ai-picker-fields">
        <div className="ai-field">
          <span id={ids.provider} className="ai-label">
            Provider
          </span>
          <ProviderTiles ref={providerField} labelledBy={ids.provider} describedBy={ids.providerHint} value={presetId} saved={new Set(view.providers.map((p) => presetFor(p).id))} onChange={choosePreset} />
          <div id={ids.providerHint} className="flex flex-col gap-1">
            {preset.kind === "reconix" && <p className="ai-hint">Its address, model and key come from the Core API&apos;s .env (read-only).</p>}
            {preset.kind === "cloud" && (
              <p className="ai-hint">{`Needs only an API key; its models are listed for you. It runs at ${host}, so the Core API sends your questions and the session data they need there.`}</p>
            )}
            {preset.kind === "custom" && host !== null && !remote && (
              <p className="ai-hint">
                On this computer. The Core API reaches it through Docker&apos;s host address, so the server must listen on the local network (LM Studio: Serve on local network).
              </p>
            )}
            {preset.kind === "local" && <p className="ai-hint">Ollama on this computer: start it with OLLAMA_HOST=0.0.0.0 so the Core API can reach it.</p>}
            {saved && preset.kind !== "reconix" && <p className="ai-hint">Saved as {providerName}: Add model switches it to the chosen model.</p>}
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
                const nextUrl = e.target.value;
                setBaseUrl(nextUrl);
                const nextSaved = savedFor(view, preset, addressOf(preset, { baseUrl: nextUrl }));
                if (created.current && nextSaved?.id !== created.current) discardCreated();
                reset(preset, nextSaved);
              }}
              onKeyDown={testOnEnter}
              maxLength={MAX_URL}
              inputMode="url"
              spellCheck={false}
              {...NOT_A_LOGIN}
              placeholder="http://127.0.0.1:1234/v1"
              aria-describedby={ids.urlHint}
              className="ai-input ai-mono"
            />
            <p id={ids.urlHint} className="ai-hint">
              {remote
                ? "Off this machine: the Core API sends your questions and the session data they need there."
                : preset.kind === "local"
                  ? "Ollama's address on this machine (the default needs no change)."
                  : "An OpenAI-compatible address, usually ending in /v1."}
            </p>
          </div>
        )}
        {showsKey(preset) && (
          <ModelKeyField
            id={ids.key}
            inputRef={keyField}
            provider={providerName}
            required={preset.key === "required"}
            keySaved={keySaved}
            removeKey={removeKey}
            keyTyped={keyTyped}
            onTyped={(typedNow) => {
              setKeyTyped(typedNow);
              setTested(null);
              setError(null);
            }}
            onRemoveKey={(remove) => {
              setRemoveKey(remove);
              setTested(null);
              setError(null);
            }}
            onKeyDown={testOnEnter}
            onBlur={() => undefined}
          />
        )}
        {/* where the connection stands: the footer's main button tests it (then adds the model) */}
        {!error && (
          <div className="ai-connect" data-state={testing ? "testing" : tested ? "ok" : ready ? "ready" : "idle"} role="status">
            {testing ? (
              <Loader className="ai-connect-icon animate-spin" aria-hidden />
            ) : tested ? (
              <CircleCheck className="ai-connect-icon" aria-hidden />
            ) : (
              <PlugZap className="ai-connect-icon" aria-hidden />
            )}
            <p>
              {testing
                ? `Connecting to ${preset.kind === "reconix" ? "the Core API's model" : (host ?? providerName)}…`
                : tested
                  ? tested
                  : ready
                    ? `${providerName} is saved but not tested here yet: Test again checks that it answers.`
                    : "Test the connection first: it checks the provider and finds its models. Nothing is used until you add one."}
            </p>
          </div>
        )}
        {list.status === "ready" && (list.models.length > 0 || manual) && (
          <ModelNameField
            id={ids.model}
            list={list}
            choice={choice}
            onChoice={(value) => {
              setChoice(value);
              setError(null);
            }}
          />
        )}
        {error && (
          <div className="ai-picker-refusal" role="alert">
            <p>{error}</p>
          </div>
        )}
      </div>
      <div className="ai-picker-foot">
        <button type="button" onClick={cancel} className="ai-btn ai-btn-small ai-btn-outline mr-auto">
          Cancel
        </button>
        {/* one test button whatever its label: swapping "Test connection" for another button
            dropped the focus to the page, and Escape then closed the whole picker. aria-disabled,
            not disabled, while it runs: a disabled button loses the focus too */}
        <button
          type="button"
          onClick={() => void testConnection()}
          aria-disabled={testing || (ready && saving)}
          className={`ai-btn ai-btn-small ${ready ? "ai-btn-outline" : "ai-btn-primary ai-btn-go"}`}
        >
          {testing ? <Loader className="size-3.5 animate-spin" aria-hidden /> : ready ? <RefreshCw className="size-3.5" aria-hidden /> : <PlugZap className="size-3.5" aria-hidden />}
          {ready ? "Test again" : testing ? "Testing…" : "Test connection"}
        </button>
        {ready && (
          <button type="button" onClick={() => void add()} disabled={saving || testing || (manual ? !choice.trim() : choice === NO_MODEL_YET)} className="ai-btn ai-btn-small ai-btn-primary ai-btn-go">
            {saving ? <Loader className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
            Add model
          </button>
        )}
      </div>
    </div>
  );
}
