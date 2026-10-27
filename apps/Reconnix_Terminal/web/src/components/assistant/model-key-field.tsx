"use client";

/* The API key field of the model picker's "Set the provider": a password field that is never
   controlled, never filled in and never kept. Its value is never React state (so React never
   writes it into the DOM's `value` attribute): the form reads it from `inputRef` when it asks
   the server, and it is emptied when the field goes (Cancel, Escape, the picker closed, the
   Assistant hidden). It tells password managers to stay away (autocomplete off and their ignore
   attributes), and the form around it is no <form>: nothing here looks like a sign-in to be
   saved. The placeholder says whether the provider needs one ("Needed by <Provider>") or not
   ("Optional"); with a key saved for this provider at this address, "Key saved: leave empty to
   keep it" and Remove key. */
import { useLayoutEffect } from "react";

import { Checkbox } from "@/components/ui/checkbox";

/** What keeps password managers off a field (1Password, LastPass, Bitwarden). */
export const NOT_A_LOGIN = { autoComplete: "off", "data-1p-ignore": true, "data-lpignore": "true", "data-bwignore": true } as const;

interface Props {
  id: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  provider: string; // its name, for "Needed by <Provider>"
  required: boolean;
  keySaved: boolean;
  removeKey: boolean;
  keyTyped: boolean;
  onTyped: (typed: boolean) => void;
  onRemoveKey: (remove: boolean) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
}

export function ModelKeyField({ id, inputRef, provider, required, keySaved, removeKey, keyTyped, onTyped, onRemoveKey, onKeyDown, onBlur }: Props) {
  const hint = `${id}-hint`;

  // when the field goes, it is emptied while it is still in the page
  useLayoutEffect(() => {
    const field = inputRef.current;
    return () => {
      if (field) field.value = "";
    };
  }, [inputRef]);

  return (
    <div className="ai-field">
      <label htmlFor={id} className="ai-label">
        API key
      </label>
      <input
        ref={inputRef}
        id={id}
        type="password"
        onChange={(e) => onTyped(e.target.value !== "")}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        spellCheck={false}
        {...NOT_A_LOGIN}
        placeholder={keySaved && !removeKey ? "Key saved" : required ? `Needed by ${provider}` : "Optional"}
        aria-describedby={hint}
        className="ai-input"
      />
      <p id={hint} className="ai-hint">
        {keySaved
          ? keyTyped
            ? "The key typed here replaces the saved one."
            : removeKey
              ? "The saved key is removed when you add the model (a key typed here replaces it)."
              : "Key saved: leave empty to keep it"
          : `${required ? "Needed." : "Optional."} Kept encrypted on this computer and never shown again.`}
      </p>
      {keySaved && <Checkbox label="Remove key" checked={removeKey} onChange={(e) => onRemoveKey(e.target.checked)} />}
    </div>
  );
}
