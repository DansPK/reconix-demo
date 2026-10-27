"use client";

/* The model picker's list, "Model": every saved model (model-picker-rules.ts `modelRows`), ✓ on
   the one that answers next, each with its provider and where it runs ("Stub · local"). One
   click, Enter or Space uses a model and closes the picker (the ✓ one just closes it), a remote
   one as much as a local one. Each row has a bin: an inline confirm ("Remove <model>
   (<provider>)? …"), focused on No; Escape there keeps it. Removing a provider's last model
   removes the provider (and its saved key). One tab stop for the rows and their bins
   (use-roving.ts). + Model, at the bottom, opens Set the provider. The first time it opens the models are on their way ("Loading the models…"); once
   they are there, focus goes to the model that answers next (else the first, else + Model), or
   to + Model when it comes back from the form. */
import { useEffect, useRef, useState } from "react";
import { Check, Loader, Plus, Trash2 } from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";
import { type ModelRow, modelRows, removeQuestion, removeRequest } from "./model-picker-rules";
import { choiceKey, type Models } from "./use-models";
import { useRoving } from "./use-roving";

const rowKey = (key: string) => `row:${key}`;
const binKey = (key: string) => `remove:${key}`;
const ADD = '[data-focus="add"]';

interface Props {
  models: Models;
  /** Back from Set the provider: focus goes to + Model. */
  fromForm: boolean;
  onChosen: () => void;
  onAdd: () => void;
}

export function ModelList({ models, fromForm, onChosen, onAdd }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const focusNext = useRef<string | null>(null); // a roving key (or ADD) to focus once drawn
  const [confirm, setConfirm] = useState<string | null>(null); // the row asked about
  const [error, setError] = useState<string | null>(null);
  const { view, status, error: loadError } = models.state;
  const rows = view ? modelRows(view) : [];
  const checked = rows.find((r) => r.checked);
  const roving = useRoving(
    rows.filter((r) => r.key !== confirm).flatMap((r) => [rowKey(r.key), binKey(r.key)]),
    checked ? rowKey(checked.key) : null,
  );
  const ready = view !== null || status === "error";

  useEffect(() => {
    if (focused.current || !ready) return;
    focused.current = true;
    const at = (selector: string) => root.current?.querySelector<HTMLElement>(selector);
    const el = (fromForm && at(ADD)) || at('[data-rove][tabindex="0"]') || at(ADD) || at("button");
    el?.focus({ preventScroll: true });
  }, [ready, fromForm]);

  // after a confirm closes, focus goes back to its bin (or, removed, to the row that took its
  // place, else + Model)
  useEffect(() => {
    const key = focusNext.current;
    if (!key) return;
    focusNext.current = null;
    const el = key === ADD ? root.current?.querySelector<HTMLElement>(ADD) : root.current?.querySelector<HTMLElement>(`[data-rove="${key}"]`);
    el?.focus({ preventScroll: true });
  });

  const pick = async (row: ModelRow) => {
    if (models.pending) return;
    if (row.checked) return onChosen();
    setError(null);
    const problem = await models.choose(row.providerId, row.model);
    if (problem) setError(problem);
    else onChosen();
  };
  const keep = (row: ModelRow) => {
    setConfirm(null);
    setError(null);
    focusNext.current = binKey(row.key);
  };
  const remove = async (row: ModelRow) => {
    const request = view && removeRequest(view, row);
    if (!request) return keep(row);
    setError(null);
    const at = rows.indexOf(row);
    const problem = await models.remove(row.key, request);
    if (problem) return setError(problem);
    const after = rows[at + 1] ?? rows[at - 1];
    focusNext.current = after ? rowKey(after.key) : ADD;
    setConfirm(null);
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
          <p className="ai-menu-state" role="status">
            <Loader className="mr-1.5 inline size-3.5 animate-spin" aria-hidden /> Loading the models…
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={root} className="ai-picker-form">
      <div className="ai-picker-body" aria-busy={models.pending !== null}>
        {status === "error" && (
          <p className="ai-error-text ai-picker-error" role="alert">
            {loadError}
          </p>
        )}
        {rows.length > 0 ? (
          <ul aria-label="Your models" onKeyDown={roving.onKeyDown} className="ai-picker-list">
            {rows.map((row) => {
              if (row.key === confirm) {
                const q = removeQuestion(view, row);
                return (
                  <li key={row.key}>
                    <div
                      role="group"
                      aria-label={q.title}
                      className="ai-menu-confirm"
                      onKeyDown={(e) => {
                        if (e.key !== "Escape") return;
                        e.preventDefault(); // keeps it; the picker stays open
                        e.stopPropagation();
                        keep(row);
                      }}
                    >
                      <p className="text-foreground">
                        Remove <span className="ai-mono">{row.model}</span> ({row.provider})? {q.detail}
                      </p>
                      {error && (
                        <p className="ai-error-text mt-1" role="alert">
                          {error}
                        </p>
                      )}
                      <div className="mt-2 flex justify-end gap-1.5">
                        <button type="button" autoFocus onClick={() => keep(row)} className="ai-btn ai-btn-small ai-btn-outline">
                          No
                        </button>
                        <button type="button" onClick={() => void remove(row)} disabled={models.pending !== null} className="ai-btn ai-btn-small ai-btn-danger-solid">
                          {models.pending === `remove:${row.key}` && <Loader className="size-3.5 animate-spin" aria-hidden />}
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                );
              }
              return (
                <li key={row.key} className="ai-picker-row">
                  <button
                    type="button"
                    aria-current={row.checked ? "true" : undefined}
                    title={row.checked ? "Answers your next question" : `Use ${row.model}`}
                    onClick={() => void pick(row)}
                    className="ai-picker-model"
                    {...roving.item(rowKey(row.key))}
                  >
                    <span className="ai-picker-check" aria-hidden>
                      {models.pending === choiceKey(row.providerId, row.model) ? <Loader className="size-3 animate-spin" /> : row.checked ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="ai-picker-text">
                      <span className="ai-picker-model-name">{row.model}</span>{" "}
                      <span className="ai-picker-meta">
                        {row.provider} · {row.where}
                      </span>
                    </span>
                  </button>
                  <IconButton
                    label={`Remove ${row.model} (${row.provider})`}
                    onClick={() => {
                      setError(null);
                      setConfirm(row.key);
                    }}
                    className="ai-picker-remove size-7 hover:text-danger [&_svg]:size-3.5"
                    {...roving.item(binKey(row.key))}
                  >
                    <Trash2 aria-hidden />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="ai-picker-empty">No model yet.</p>
        )}
        {error && confirm === null && (
          <p className="ai-error-text ai-picker-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="ai-picker-foot">
        <button type="button" data-focus="add" aria-label="+ Model" onClick={onAdd} className="ai-btn ai-picker-add">
          <Plus className="size-3.5" aria-hidden />
          Model
        </button>
      </div>
    </div>
  );
}
