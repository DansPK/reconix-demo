"use client";

/* The model picker's list, "Model". A switch on top chooses what it shows:

   - Models: a search field ("Search a model", any part of the model's or the provider's name)
     and one flat list of every saved model, as in Open WebUI's model selector. A row shows its
     provider's avatar, the model's name, the provider and where it runs, and ✓ on the model that
     answers next. One click, Enter or Space uses it and closes the picker (the ✓ one just
     closes it); Enter in the search field uses the first match, Down moves into the list.
   - Providers: every provider the TUI's /provider offers, in its order (Reconix, OpenAI,
     Anthropic, DeepSeek, Ollama, Custom), each with its kind and what the TUI's menu says about
     it (not set up, its models, in use). One opens its page: back to Providers, its status, Set
     up (opens Set the provider on it) or, once saved, its models with Update and a bin that asks
     inline ("Remove <provider>? Its models … go with it."), focused on No; Escape keeps it.

   A model off this computer waits for the TUI's OK: its row says how to give it. What the switch
   showed last is remembered per browser (model-tab.ts). + Model, at the bottom, opens Set the
   provider (on the provider whose page is open). While the models are on their way it shows
   placeholder rows; then focus goes to the search field, or to + Model back from the form. */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Hourglass, Loader, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "./confirm-dialog";
import { type Preset, type PresetId, PRESET_IDS, PRESETS, presetOf } from "@/lib/assistant/models/presets";
import { NEEDS_APPROVAL, type ProviderView } from "@/lib/assistant/models/view";
import { cleanSearchQuery, MAX_SEARCH_QUERY } from "@/lib/search";
import { rememberedTab, rememberTab } from "./model-tab";
import { type ModelRow, badgeLabel, endpointHost, modelRows, presetFor, removeRequest, savedName } from "./model-picker-rules";
import { kindLabel, ProviderAvatar, shortLabel } from "./provider-look";
import { choiceKey, type Models } from "./use-models";
import { useRoving } from "./use-roving";

export { shortLabel } from "./provider-look";

const ADD = '[data-focus="add"]';
const SEARCH = '[data-focus="search"]';
const FIRST = '[data-rove][tabindex="0"]';

/** What the list shows: every model, every provider, or one provider's page. */
export type Tab = "models" | "providers" | PresetId;

const isTab = (tab: string | null): tab is Tab => tab === "models" || tab === "providers" || (PRESET_IDS as readonly string[]).includes(tab ?? "");

export interface ProviderSummary {
  preset: Preset;
  count: number; // its models (0: not set up)
  active: boolean; // holds the model that answers next
  status: string; // "Not set up", "2 models · in use"
}

/** Every provider the TUI's /provider offers, in its order, with what its menu says. */
export function providersOf(rows: readonly ModelRow[]): ProviderSummary[] {
  return PRESETS.map((preset) => {
    const mine = rows.filter((r) => r.preset === preset.id);
    const active = mine.some((r) => r.checked);
    const status = mine.length ? `${mine.length} model${mine.length === 1 ? "" : "s"}${active ? " · in use" : ""}` : "Not set up";
    return { preset, count: mine.length, active, status };
  });
}

/** The models a search shows (any part of the model's or the provider's name, any case),
    within one provider when `only` is given. */
export function shownRows(rows: readonly ModelRow[], query: string, only?: PresetId): ModelRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => (!only || r.preset === only) && (!q || r.model.toLowerCase().includes(q) || r.provider.toLowerCase().includes(q)));
}

/** What setting a provider up asks, in the TUI's words. */
export function setupHint(preset: Preset): string {
  if (preset.kind === "reconix") return "Uses the Core API's own model (RECONIX_MODEL_* in .env).";
  if (preset.kind === "cloud") return "Needs only an API key: its models are listed for you.";
  if (preset.kind === "local") return "Needs its address and a model it has pulled; no key.";
  return "Needs its address, a model and, if it asks for one, an API key.";
}

/** The same, short enough for a provider's row. */
export function shortHint(preset: Preset): string {
  if (preset.kind === "cloud") return "Not set up · just an API key";
  if (preset.kind === "local") return "Not set up · address and a model";
  if (preset.kind === "custom") return "Not set up · address, model, optional key";
  return "Not set up";
}

/** The name with the searched part marked. */
function Marked({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="ai-picker-mark">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

interface Props {
  models: Models;
  /** Back from Set the provider: focus goes to + Model. */
  fromForm: boolean;
  onChosen: () => void;
  /** Opens Set the provider (on `preset` and optional `baseUrl` when editing an endpoint). */
  onAdd: (preset?: PresetId, baseUrl?: string) => void;
}

export function ModelList({ models, fromForm, onChosen, onAdd }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const focusNext = useRef<string | null>(null); // a selector to focus once drawn
  const [confirm, setConfirm] = useState<string | null>(null); // the saved provider asked about
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [waiting, setWaiting] = useState<string | null>(null); // a remote model waiting for the TUI's OK
  const [tab, setTab] = useState<Tab>(() => {
    const kept = rememberedTab();
    return isTab(kept) ? kept : "models";
  });
  const { view, status, error: loadError } = models.state;
  const rows = view ? modelRows(view) : [];
  const providers = providersOf(rows);
  const page = tab !== "models" && tab !== "providers" ? presetOf(tab) : null;
  const list = tab === "models" ? shownRows(rows, query) : page ? shownRows(rows, "", page.id) : [];
  const saved: ProviderView[] = view && page ? view.providers.filter((p) => presetFor(p).id === page.id) : [];
  const checked = list.find((r) => r.checked);
  const roving = useRoving(
    tab === "providers" ? providers.map((p) => `prov:${p.preset.id}`) : list.map((r) => `row:${r.key}`),
    tab === "providers" ? `prov:${(providers.find((p) => p.active) ?? providers[0]).preset.id}` : checked ? `row:${checked.key}` : null,
  );
  const ready = view !== null || status === "error";
  const setUp = providers.filter((p) => p.count > 0).length;

  useEffect(() => {
    if (focused.current || !ready) return;
    focused.current = true;
    const at = (selector: string) => root.current?.querySelector<HTMLElement>(selector);
    const el = (fromForm && at(ADD)) || at(SEARCH) || at(FIRST) || at(ADD) || at("button");
    el?.focus({ preventScroll: true });
  }, [ready, fromForm]);

  // after a step changes, focus goes where it said (a bin, the back button, a provider…)
  useEffect(() => {
    const selector = focusNext.current;
    if (!selector) return;
    focusNext.current = null;
    root.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  });

  const go = (next: Tab, focus?: string) => {
    setTab(next);
    rememberTab(next);
    setConfirm(null);
    setError(null);
    setWaiting(null);
    if (focus) focusNext.current = focus;
  };
  const pick = async (row: ModelRow) => {
    if (models.pending) return;
    if (row.checked) return onChosen();
    setError(null);
    setWaiting(null);
    const problem = await models.choose(row.providerId, row.model);
    if (problem === NEEDS_APPROVAL) setWaiting(row.key);
    else if (problem) setError(problem);
    else onChosen();
  };
  const keep = (providerId: string) => {
    setConfirm(null);
    setError(null);
    focusNext.current = `[data-remove="${providerId}"]`;
  };
  /** Removes a provider (not the one in use: the API keeps the active one). */
  const remove = async (providerId: string) => {
    const request = view && removeRequest(view, { providerId });
    if (!request) return keep(providerId);
    setError(null);
    const name = view.providers.find((p) => p.id === providerId);
    const problem = await models.remove(providerId, request);
    if (problem) return setError(problem);
    if (name) toast(`${savedName(name)} removed.`);
    go("providers", page ? `[data-rove="prov:${page.id}"]` : FIRST);
  };

  if (!view) {
    return (
      <div ref={root} className="ai-picker-body">
        {status === "error" ? (
          <div className="ai-menu-state" role="alert">
            <p>Couldn&apos;t load the models: {loadError}</p>
            <button type="button" onClick={models.load} className="ai-btn ai-btn-small ai-btn-outline mt-2">
              Try again
            </button>
          </div>
        ) : (
          <div role="status" className="ai-picker-skeleton">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="ai-picker-skeleton-row" style={{ "--i": i } as React.CSSProperties}>
                <span className="ai-picker-skeleton-avatar" />
                <span className="ai-picker-skeleton-lines">
                  <span style={{ width: `${70 - i * 9}%` }} />
                  <span style={{ width: "34%" }} />
                </span>
              </div>
            ))}
            <span className="sr-only">Loading the models…</span>
          </div>
        )}
      </div>
    );
  }

  const providerBadge = new Map(view.providers.map((p) => [p.id, badgeLabel(p)]));

  const modelList = (items: ModelRow[], q: string, { compact = false, listLabel = "Your models" }: { compact?: boolean; listLabel?: string } = {}) => (
    <ul key={compact ? listLabel : tab} aria-label={listLabel} onKeyDown={roving.onKeyDown} className="ai-picker-list">
      {items.map((row, i) => {
        const busy = models.pending === choiceKey(row.providerId, row.model);
        const badge = providerBadge.get(row.providerId) ?? row.provider;
        return (
          <li key={row.key} className="ai-picker-row" style={{ "--i": Math.min(i, 10) } as React.CSSProperties}>
            <button
              type="button"
              aria-current={row.checked ? "true" : undefined}
              title={row.checked ? "Answers your next question" : `Use ${row.model}`}
              onClick={() => void pick(row)}
              className={compact ? "ai-picker-model is-compact" : "ai-picker-model"}
              data-first={q.trim() && i === 0 ? "true" : undefined}
              data-pending={busy ? "true" : undefined}
              {...roving.item(`row:${row.key}`)}
            >
              {!compact && <ProviderAvatar preset={row.preset} />}
              <span className="ai-picker-text">
                <span className="ai-picker-model-name">
                  <Marked text={row.model} query={q} />
                </span>
                {!compact && (
                  <span className="ai-picker-badges">
                    <span className="ai-picker-badge">
                      <Marked text={badge} query={q} />
                    </span>
                    <span className="ai-picker-badge" data-where={row.where}>
                      {row.where}
                    </span>
                  </span>
                )}
              </span>
              <span className="ai-picker-tick" aria-hidden>
                {busy ? (
                  <Loader className="size-3.5 animate-spin" />
                ) : row.checked ? (
                  <Check className="ai-picker-check-pop size-4" strokeWidth={2.5} />
                ) : q.trim() && i === 0 ? (
                  <kbd className="ai-picker-kbd">↵</kbd>
                ) : null}
              </span>
            </button>
            {waiting === row.key && (
              <div role="status" className={compact ? "ai-picker-waiting is-compact" : "ai-picker-waiting"}>
                <Hourglass className="ai-picker-waiting-icon" aria-hidden />
                <div className="min-w-0">
                  <p className="ai-picker-waiting-title">Approve {row.model} in the TUI first</p>
                  <p className="ai-picker-waiting-text">
                    It runs off this computer ({badge}), so the Core API asks a person before sending it your scope, plans and chat. In the TUI, run{" "}
                    <code className="ai-picker-code">/model</code>, pick <span className="text-foreground">{row.model}</span> and answer <span className="text-foreground">Approve</span>.
                  </p>
                  <button type="button" onClick={() => void pick(row)} disabled={models.pending !== null} className="ai-btn ai-btn-small ai-btn-outline mt-2">
                    <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden />I approved it, use it
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div ref={root} className="ai-picker-form">
      {/* Models | Providers: hidden when drilled into one provider's page */}
      {!page && (
        <div role="tablist" aria-label="Show" className="ai-picker-switch">
          {(["models", "providers"] as const).map((t) => {
            const on = t === "models" ? tab === "models" : tab !== "models";
            return (
              <button key={t} type="button" role="tab" aria-selected={on} onClick={() => go(t, t === "models" ? SEARCH : FIRST)} className="ai-picker-switch-btn">
                {t === "models" ? "Models" : "Providers"}
                <span className="ai-picker-pill-count" aria-hidden>
                  {t === "models" ? rows.length : `${setUp}/${providers.length}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {tab === "models" && rows.length > 0 && (
        <div className="ai-picker-search">
          <Search className="ai-picker-search-icon" aria-hidden />
          <input
            type="search"
            data-focus="search"
            value={query}
            maxLength={MAX_SEARCH_QUERY}
            onChange={(e) => setQuery(cleanSearchQuery(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && list[0]) {
                e.preventDefault();
                void pick(list[0]);
              } else if (e.key === "ArrowDown" && list[0]) {
                e.preventDefault();
                root.current?.querySelector<HTMLElement>(FIRST)?.focus();
              }
            }}
            placeholder="Search a model"
            aria-label="Search your models"
            spellCheck={false}
            autoComplete="off"
            className="ai-picker-search-input"
          />
        </div>
      )}

      {page && (
        <div className="ai-picker-page-head">
          <IconButton label="Back to providers" data-focus="back" onClick={() => go("providers", `[data-rove="prov:${page.id}"]`)} className="size-7 [&_svg]:size-3.5">
            <ArrowLeft aria-hidden />
          </IconButton>
          <ProviderAvatar preset={page.id} size={30} />
          <span className="ai-picker-text">
            <span className="ai-picker-page-title">{page.label}</span>
            <span className="ai-picker-meta">
              {kindLabel(page)} · {providers.find((p) => p.preset.id === page.id)?.status}
            </span>
          </span>
        </div>
      )}

      <div className="ai-picker-body" aria-busy={models.pending !== null}>
        {status === "error" && (
          <p className="ai-error-text ai-picker-error" role="alert">
            {loadError}
          </p>
        )}

        {/* Models */}
        {tab === "models" &&
          (rows.length === 0 ? (
            <div className="ai-picker-setup">
              <p className="ai-picker-setup-title">No model yet.</p>
              <p className="ai-picker-meta">Choose a provider to set one up, as with /provider in the TUI.</p>
              <button type="button" onClick={() => go("providers", FIRST)} className="ai-btn ai-btn-small ai-picker-add mt-2">
                Choose a provider
                <ChevronRight className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : list.length === 0 ? (
            <div className="ai-picker-empty">
              <p>No model matches “{query.trim()}”.</p>
              <button type="button" disabled title="Provider changes are unavailable in the offline demo" onClick={() => onAdd()} className="ai-btn ai-btn-small ai-btn-outline mt-2">
                <Plus className="size-3.5" aria-hidden />
                Add “{query.trim()}”
              </button>
            </div>
          ) : (
            modelList(list, query)
          ))}

        {/* Providers: the TUI's /provider menu */}
        {tab === "providers" && (
          <ul aria-label="Providers" onKeyDown={roving.onKeyDown} className="ai-picker-list">
            {providers.map((p, i) => {
              // not set up yet: straight to Set the provider on it (no page in between)
              const fresh = p.count === 0 && p.preset.kind !== "reconix";
              return (
                <li key={p.preset.id} className="ai-picker-row" style={{ "--i": i } as React.CSSProperties}>
                  <button
                    type="button"
                    disabled={fresh}
                    title={fresh ? "Provider changes are unavailable in the offline demo" : `Open ${p.preset.label}`}
                    onClick={() => (fresh ? onAdd(p.preset.id) : go(p.preset.id, '[data-focus="back"]'))}
                    className="ai-picker-model ai-picker-provider-row"
                    data-setup={p.count === 0 ? "none" : undefined}
                    {...roving.item(`prov:${p.preset.id}`)}
                  >
                    <ProviderAvatar preset={p.preset.id} />
                    <span className="ai-picker-text">
                      <span className="ai-picker-provider-name">
                        {p.preset.label}
                        {p.active && <span className="ai-picker-pill-dot" role="img" aria-label="in use" />}
                      </span>
                      <span className="ai-picker-meta">{fresh ? shortHint(p.preset) : p.status}</span>
                    </span>
                    <span className="ai-picker-badge ai-picker-kind" data-kind={p.preset.kind}>
                      {kindLabel(p.preset)}
                    </span>
                    {fresh ? (
                      <span className="ai-picker-setup-go" aria-hidden>
                        <Plus className="size-3" strokeWidth={2.5} />
                        Set up
                      </span>
                    ) : (
                      <ChevronRight className="ai-picker-chevron-go" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* One provider's page */}
        {page && saved.length === 0 && (
          <div className="ai-picker-setup">
            <p className="ai-picker-setup-title">{shortLabel(page)} isn&apos;t set up yet.</p>
            <p className="ai-picker-meta">{setupHint(page)}</p>
            <button type="button" disabled title="Provider changes are unavailable in the offline demo" onClick={() => onAdd(page.id)} className="ai-btn ai-btn-small ai-picker-add mt-2">
              <Plus className="size-3.5" aria-hidden />
              Set up {shortLabel(page)}
            </button>
          </div>
        )}
        {page && saved.length > 0 && (
          <div className="ai-picker-endpoints">
            {saved.map((p) => {
              const host = endpointHost(p.baseUrl, savedName(p));
              const endpointModels = list.filter((r) => r.providerId === p.id);
              const inUse = view.active?.providerId === p.id;
              return (
                <section key={p.id} aria-label={host} className="ai-picker-endpoint-card" data-active={inUse ? "true" : undefined}>
                  <header className="ai-picker-endpoint-head">
                    <div className="ai-picker-endpoint-info">
                      <div className="ai-picker-endpoint-host-row">
                        <span className="ai-picker-endpoint-host" title={p.baseUrl || savedName(p)}>
                          {host}
                        </span>
                        {inUse && <span className="ai-picker-pill-dot" role="img" aria-label="in use" />}
                      </div>
                      <div className="ai-picker-endpoint-tags">
                        <span className="ai-picker-badge" data-where={p.local ? "local" : "remote"}>
                          {p.local ? "local" : "remote"}
                        </span>
                        {p.keySaved && <span className="ai-picker-badge">key saved</span>}
                        {inUse && <span className="ai-picker-meta">in use</span>}
                      </div>
                    </div>
                    {page.kind !== "reconix" && (
                      <div className="ai-picker-endpoint-actions">
                        <button type="button" disabled title="Provider changes are unavailable in the offline demo" onClick={() => onAdd(page.id, p.baseUrl)} className="ai-btn ai-btn-small ai-btn-outline ai-page-action">
                          <Pencil className="size-3" aria-hidden />
                          Edit
                        </button>
                        <button
                          type="button"
                          data-remove={p.id}
                          onClick={() => {
                            setError(null);
                            setConfirm(p.id);
                          }}
                          className="ai-btn ai-btn-small ai-btn-outline ai-page-action ai-page-action-danger"
                        >
                          <Trash2 className="size-3" aria-hidden />
                          Remove
                        </button>
                      </div>
                    )}
                  </header>
                  {endpointModels.length > 0 && modelList(endpointModels, "", { compact: true, listLabel: `${host} models` })}
                  {confirm === p.id &&
                    (inUse ? (
                      // in use: the API keeps the active provider, so say what to do instead
                      <ConfirmDialog
                        tone="info"
                        title={`${savedName(p)} is in use`}
                        cancelLabel="OK"
                        confirmLabel="Choose another model"
                        onCancel={() => keep(p.id)}
                        onConfirm={() => go("models", SEARCH)}
                      >
                        It answers your questions now. Choose another model first, then you can remove it.
                      </ConfirmDialog>
                    ) : (
                      <ConfirmDialog
                        tone="danger"
                        title={`Remove ${savedName(p)}?`}
                        cancelLabel="Cancel"
                        confirmLabel="Remove"
                        busy={models.pending === `remove:${p.id}`}
                        error={error}
                        onCancel={() => keep(p.id)}
                        onConfirm={() => void remove(p.id)}
                      >
                        Its {p.models.length === 1 ? "model" : `${p.models.length} models`}
                        {p.keySaved ? " and saved API key" : ""} {p.models.length === 1 && !p.keySaved ? "goes" : "go"} with it. You can set it up again later.
                      </ConfirmDialog>
                    ))}
                </section>
              );
            })}
          </div>
        )}

        {error && confirm === null && (
          <p className="ai-error-text ai-picker-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="ai-picker-foot ai-picker-foot-list">
        <span className="ai-picker-keys" aria-hidden>
          <kbd className="ai-picker-kbd">↑↓</kbd> move <kbd className="ai-picker-kbd">↵</kbd> {tab === "providers" ? "open or set up" : "use"} <kbd className="ai-picker-kbd">esc</kbd> close
        </span>
        <button type="button" data-focus="add" aria-label="+ Model" disabled title="Provider changes are unavailable in the offline demo" onClick={() => onAdd(page?.id)} className="ai-btn ai-btn-small ai-picker-add">
          <Plus className="size-3.5" aria-hidden />
          {page && page.kind !== "reconix" ? `Add to ${shortLabel(page)}` : "Add model"}
        </button>
      </div>
    </div>
  );
}
