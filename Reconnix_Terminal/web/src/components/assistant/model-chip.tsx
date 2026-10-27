"use client";

/* The composer's model chip, bottom left in the message box: `● <model> ▾` with a green dot
   while a model answers (its provider in the tooltip and the accessible name), `● Choose a
   model ▾` with an amber dot while none can (the reason in the tooltip; the label carries the
   state, never the colour alone). It opens the model picker above the composer
   (model-picker.tsx), whose data it keeps between opens (use-models.ts) and reloads on each.
   It stays usable while the message box is disabled for want of a model: it is how one is
   chosen. The picker closes when the
   Assistant is hidden (Minimize, Back, another view: use-assistant-shown.ts), so nothing typed in
   it stays behind the inert stage. */
import { useCallback, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { useAssistant } from "./assistant-provider";
import { chipState } from "./model-picker-rules";
import { ModelPicker } from "./model-picker";
import { useAssistantShown } from "./use-assistant-shown";
import { useModels } from "./use-models";

export function ModelChip() {
  const { info, setModel } = useAssistant();
  const models = useModels(setModel);
  const [open, setOpen] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  const id = useId();
  const state = chipState(info.model);

  // the Assistant hidden: the picker closes with it (and what was typed in it goes)
  const shown = useAssistantShown();
  const [wasShown, setWasShown] = useState(shown);
  if (shown !== wasShown) {
    setWasShown(shown);
    if (!shown) setOpen(false);
  }

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) chip.current?.focus({ preventScroll: true });
  }, []);

  const content = (
    <>
      <span className="ai-dot" data-tone={state.tone} aria-hidden />
      <span className="ai-model-chip-label">{state.label}</span>
      <ChevronDown className="ai-model-chip-caret" aria-hidden />
    </>
  );

  return (
    <>
      <button
        ref={chip}
        type="button"
        onClick={() => {
          if (open) return close(true);
          setOpen(true);
          models.load();
        }}
        aria-haspopup="dialog"
        aria-expanded={open && shown}
        aria-controls={open && shown ? id : undefined}
        aria-label={state.name}
        title={state.title}
        data-tone={state.tone}
        className="ai-model-chip"
      >
        {content}
      </button>
      {open && shown && <ModelPicker id={id} models={models} chip={chip} onClose={close} />}
    </>
  );
}
