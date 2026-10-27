"use client";

/* The model picker: a popover that opens upward from the composer's model chip (on a phone, a
   sheet over the composer's width) with two steps in the same panel: "Model", your saved models
   with + Model at the bottom (model-list.tsx), and "Set the provider", the form + Model opens
   (model-provider-form.tsx). A dialog named after its step; Escape goes back to the list, then
   closes; so do Back and Cancel on the form. A click outside, or focus moving on to something
   else on the page, closes it (so does hiding the Assistant: model-chip.tsx). Focus goes to
   each step's first control, to + Model when the form goes back, and to the chip when the picker
   closes (model-chip.tsx). Its height fits the room above the composer (use-fit-above.ts).
   Nothing typed in the form outlives it: the API key is never React state nor a DOM attribute,
   and its field is emptied when the form goes. */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";
import { ModelList } from "./model-list";
import { ModelProviderForm } from "./model-provider-form";
import { useFitAbove } from "./use-fit-above";
import type { Models } from "./use-models";

type Step = { kind: "list"; fromForm: boolean } | { kind: "add" };

interface Props {
  id: string;
  models: Models;
  chip: React.RefObject<HTMLButtonElement | null>;
  /** Closes it; `refocus`: focus goes back to the chip (not after a click elsewhere). */
  onClose: (refocus: boolean) => void;
}

export function ModelPicker({ id, models, chip, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>({ kind: "list", fromForm: false });
  useFitAbove(panel, step.kind);
  const view = models.state.view;
  const adding = step.kind === "add" && view !== null;
  const title = adding ? "Set the provider" : "Model";

  const toList = () => setStep({ kind: "list", fromForm: true });

  // a click outside closes it; so does Escape while focus is outside it (on the chip), and focus
  // moving on to anything else on the page (Tab past it, say). Focus that goes nowhere (another
  // window, or a control of its own that a step change took away) leaves it open.
  useEffect(() => {
    const inside = (n: Node) => Boolean(panel.current?.contains(n) || chip.current?.contains(n));
    const onDown = (e: PointerEvent) => {
      if (!inside(e.target as Node)) onClose(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget;
      if (next instanceof Node && inside(e.target as Node) && !inside(next)) onClose(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [chip, onClose]);

  return (
    <div
      ref={panel}
      id={id}
      role="dialog"
      aria-label={title}
      data-step={adding ? "add" : "list"}
      className="ai-picker"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        e.preventDefault(); // back to the list, or closed (the document's listener leaves it alone)
        if (adding) toList();
        else onClose(true);
      }}
    >
      <div className="ai-picker-head">
        {adding && (
          <IconButton label="Back to your models" onClick={toList} className="size-7 [&_svg]:size-3.5">
            <ArrowLeft aria-hidden />
          </IconButton>
        )}
        <h2 className="ai-picker-title">{title}</h2>
        <IconButton label="Close" onClick={() => onClose(true)} className="size-7 [&_svg]:size-3.5">
          <X aria-hidden />
        </IconButton>
      </div>
      {adding ? (
        <ModelProviderForm view={view} models={models} onCancel={toList} onDone={() => onClose(true)} />
      ) : (
        <ModelList models={models} fromForm={step.kind === "list" && step.fromForm} onChosen={() => onClose(true)} onAdd={() => setStep({ kind: "add" })} />
      )}
    </div>
  );
}
