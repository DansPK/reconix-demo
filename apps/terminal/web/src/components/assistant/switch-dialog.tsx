"use client";

/* "Switch the chat to <run>?": shown when the AI Assistant is on screen and the open chat is about
   another run than the dashboard shows (use-switch-ask.ts). A modal dialog (useModalDialog) with
   two choices: continue this chat, or a new chat about the dashboard's run. The dialog itself
   takes the focus, not a button: it can open while the operator is typing (the Ask bar), and a
   stray Space or Enter must not choose. A question that waits for the answer is shown and goes
   to the chosen chat. Escape or Close keeps the chat and leaves the question unsent in the draft.
   Not while an answer is being written: it waits until the reply ends. */
import { useId } from "react";
import { MessageSquare, MessageSquarePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { useModalDialog } from "@/components/ui/use-modal-dialog";
import { useAssistant } from "./assistant-provider";
import { useAssistantShown } from "./use-assistant-shown";

const QUOTE = 160; // characters of the waiting question shown

export function SwitchDialog() {
  const { switchChoice, busy, draft } = useAssistant();
  const { pending, held, keep, switchOver, dismiss } = switchChoice;
  const shown = useAssistantShown();
  const open = shown && !busy && pending !== null;
  const dialog = useModalDialog(open, true); // focus on the dialog, not a button
  const id = useId();

  const question = draft.trim();
  const from = pending?.from.label ?? "";
  const to = pending?.to.label ?? "";
  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-about`}
      className="ui-dialog"
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault(); // Escape: the page closes it (dismiss → not pending any more)
        dismiss();
      }}
      onClose={() => {
        if (open) dismiss(); // closed by the browser after all: the page follows
      }}
    >
      <div className="ui-dialog-body">
        <header className="ui-dialog-head">
          <h2 id={`${id}-title`} className="ui-dialog-title">
            Switch the chat to {to}?
          </h2>
          <IconButton label="Close and keep this chat" onClick={dismiss} className="size-7">
            <X aria-hidden />
          </IconButton>
        </header>
        <p id={`${id}-about`} className="ui-dialog-text">
          This chat is about <span className="text-foreground">{from}</span>. The dashboard now shows{" "}
          <span className="text-foreground">{to}</span>.
        </p>
        {held && question && (
          <p className="ai-dialog-quote">
            Your question is sent to the chat you choose: “{question.length > QUOTE ? `${question.slice(0, QUOTE)}…` : question}”
          </p>
        )}
        <footer className="ui-dialog-foot ai-dialog-foot">
          <Button variant="outline" onClick={keep}>
            <MessageSquare className="size-3.5" aria-hidden />
            Continue this chat
          </Button>
          <Button onClick={switchOver}>
            <MessageSquarePlus className="size-3.5" aria-hidden />
            New chat about {to}
          </Button>
        </footer>
      </div>
    </dialog>
  );
}
