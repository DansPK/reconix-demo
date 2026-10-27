"use client";

/* The Model field of the model picker's "Set the provider": a native select of the models the
   provider listed (Fetch models, or the form's own fetch once the provider, the address and the
   key are set), with "Type a model name…" last, which shows a text field for the name. Before a
   list is there the select says "Fetch models to list them". A note under it says when the list
   isn't the server's (the models saved) or when there is none to show. Enter in the name field is
   Add model. */
import { Loader } from "lucide-react";

import { MODEL_NAME_MAX } from "./model-name-rules";
import { type ModelList, NO_MODEL_YET, TYPED } from "./model-picker-rules";

/** What the form knows of the provider's models. `sig`: the values the list was fetched for. */
export type ListState = { status: "none" } | { status: "loading" } | ({ status: "ready"; sig: string } & ModelList);

interface Props {
  id: string;
  list: ListState;
  choice: string;
  typed: string;
  typedRef: React.RefObject<HTMLInputElement | null>;
  onChoice: (value: string) => void;
  onTyped: (value: string) => void;
  onFetch: () => void;
  onSubmit: () => void;
}

export function ModelNameField({ id, list, choice, typed, typedRef, onChoice, onTyped, onFetch, onSubmit }: Props) {
  const select = `${id}-select`;
  const note = `${id}-note`;
  const fetching = list.status === "loading";
  const listed = list.status === "ready" ? list.models : [];
  const shownNote = list.status === "ready" ? list.note : null;

  return (
    <div className="ai-field">
      <label htmlFor={select} className="ai-label">
        Model
      </label>
      <div className="ai-picker-inline">
        <select
          id={select}
          value={choice}
          onChange={(e) => onChoice(e.target.value)}
          aria-describedby={shownNote ? note : undefined}
          aria-busy={fetching || undefined}
          className="ai-select ai-mono"
        >
          {list.status !== "ready" && (
            <option value={NO_MODEL_YET} disabled>
              {fetching ? "Fetching the models…" : "Fetch models to list them"}
            </option>
          )}
          {listed.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value={TYPED}>Type a model name…</option>
        </select>
        <button type="button" onClick={onFetch} className="ai-btn ai-btn-small ai-btn-outline shrink-0">
          {fetching && <Loader className="size-3.5 animate-spin" aria-hidden />}
          Fetch models
        </button>
      </div>
      {shownNote && (
        <p id={note} className="ai-hint">
          {shownNote}
        </p>
      )}
      {choice === TYPED && (
        <input
          ref={typedRef}
          value={typed}
          onChange={(e) => onTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            onSubmit();
          }}
          maxLength={MODEL_NAME_MAX}
          spellCheck={false}
          autoComplete="off"
          placeholder="e.g. llama3.2"
          aria-label="Model name"
          className="ai-input ai-mono"
        />
      )}
    </div>
  );
}
