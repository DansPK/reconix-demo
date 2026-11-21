"use client";

/* The Model field of the model picker's "Set the provider": a selectable list of the provider's
   models styled like the endpoint model card, found by the form's Test connection (a cloud
   service's models once its key works, Reconix's, or what an Ollama or a custom server on this
   computer lists). Falls back to a text input only for remote custom servers that cannot list. */

import { Check } from "lucide-react";

import { type ModelList } from "./model-picker-rules";
import { NOT_A_LOGIN } from "./model-key-field";
import { MODEL_NAME_MAX } from "./model-name-rules";

/** What the form knows of the provider's models. `sig`: the values the list was fetched for. */
export type ListState = { status: "none" } | { status: "loading" } | ({ status: "ready"; sig: string } & ModelList);

interface Props {
  id: string;
  list: ListState;
  choice: string;
  onChoice: (value: string) => void;
}

export function ModelNameField({ id, list, choice, onChoice }: Props) {
  const select = `${id}-select`;
  const labelId = `${id}-label`;
  const note = `${id}-note`;
  const fetching = list.status === "loading";
  const listed = list.status === "ready" ? list.models : [];
  const manual = list.status === "ready" && listed.length === 0;
  const shownNote = list.status === "ready" ? list.note : null;

  const move = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!listed.length) return;
    const at = Math.max(0, listed.indexOf(choice));
    let nextIndex = -1;
    if (e.key === "ArrowDown") nextIndex = (at + 1) % listed.length;
    else if (e.key === "ArrowUp") nextIndex = (at - 1 + listed.length) % listed.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = listed.length - 1;
    if (nextIndex < 0) return;
    e.preventDefault();
    const next = listed[nextIndex];
    const group = e.currentTarget;
    onChoice(next);
    requestAnimationFrame(() => group.querySelector<HTMLElement>(`[data-model-index="${nextIndex}"]`)?.focus());
  };

  return (
    <div className="ai-field">
      {manual ? (
        <label htmlFor={select} className="ai-label">
          Model
        </label>
      ) : (
        <span id={labelId} className="ai-label">
          Model
        </span>
      )}
      {manual ? (
        <div className="ai-picker-inline">
          <input
            id={select}
            type="text"
            value={choice}
            onChange={(e) => onChoice(e.target.value)}
            maxLength={Math.min(MODEL_NAME_MAX, 100)}
            spellCheck={false}
            {...NOT_A_LOGIN}
            placeholder="e.g. llama-3.3-70b-versatile"
            aria-describedby={shownNote ? note : undefined}
            className="ai-input ai-mono"
          />
        </div>
      ) : (
        <div
          id={select}
          role="radiogroup"
          aria-labelledby={labelId}
          aria-describedby={shownNote ? note : undefined}
          aria-busy={fetching || undefined}
          onKeyDown={move}
          className="ai-picker-endpoint-card ai-model-choice-card"
        >
          {listed.length === 0 ? (
            <p className="ai-picker-meta px-2 py-1.5">{fetching ? "Listing the models…" : "Test connection to list the models"}</p>
          ) : (
            <ul className="ai-picker-list">
              {listed.map((m, i) => {
                const selected = m === choice;
                return (
                  <li key={m} className="ai-picker-row">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      tabIndex={selected || (!listed.includes(choice) && i === 0) ? 0 : -1}
                      data-model-index={i}
                      onClick={() => onChoice(m)}
                      className="ai-picker-model is-compact"
                    >
                      <span className="ai-picker-text">
                        <span className="ai-picker-model-name">{m}</span>
                      </span>
                      <span className="ai-picker-tick" aria-hidden>
                        {selected && <Check className="ai-picker-check-pop size-4" strokeWidth={2.5} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {shownNote && (
        <p id={note} className="ai-hint">
          {shownNote}
        </p>
      )}
    </div>
  );
}
