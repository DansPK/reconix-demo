"use client";

/* The assistant's message box: a rounded box with the shared draft on top (the Overview's Ask
   bar edits the same one), growing with its text up to 8 lines, and a row under it with the
   model chip on the left (it opens the model picker above the box) and, on the right, the hint
   "Enter to send · Shift+Enter for new line" (Esc to stop while a reply is written; hidden on a
   phone) and the round send button (Stop while a reply is written). Enter sends, Shift+Enter
   starts a new line, Esc stops a reply being written. A counter shows near the 4,000-character
   limit. When asking isn't possible here, the box is disabled and the reason is shown above it;
   the chip stays usable (choosing a model is how asking becomes possible). The picker's own forms
   sit outside this form: only the text area is in it, the send button joins it by its id. No
   microphone: the app has no voice input. */
import { forwardRef, useId, useImperativeHandle, useRef } from "react";
import { ArrowUp, Square } from "lucide-react";
import { MAX_QUESTION } from "@/lib/assistant/request";
import { useAssistant } from "./assistant-provider";
import { ModelChip } from "./model-chip";
import { useAutoResize } from "./use-auto-resize";

const COUNT_FROM = MAX_QUESTION - 500;

export const Composer = forwardRef<HTMLTextAreaElement, { label: string; disabledReason: string | null }>(function Composer({ label, disabledReason }, ref) {
  const { draft, setDraft, ask, busy, stop, opening } = useAssistant();
  const field = useRef<HTMLTextAreaElement>(null);
  const formId = useId();
  useImperativeHandle(ref, () => field.current as HTMLTextAreaElement, []);
  useAutoResize(field, draft);

  const disabled = disabledReason !== null;
  const empty = !draft.trim();
  const send = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!busy && !disabled && !empty) ask();
  };
  const length = draft.length;
  const tone = length >= MAX_QUESTION ? "danger" : length >= MAX_QUESTION - 100 ? "warning" : undefined;

  return (
    <div className="ai-composer" data-disabled={disabled ? "" : undefined}>
      <form id={formId} onSubmit={send}>
        <textarea
          ref={field}
          rows={1}
          value={draft}
          maxLength={MAX_QUESTION}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
            else if (e.key === "Escape" && busy) {
              e.preventDefault();
              stop();
            }
          }}
          aria-label={label}
          aria-describedby={disabled ? "ai-composer-reason" : undefined}
          placeholder={disabled ? "Asking isn't available here (see above)" : "Ask anything about your assessments…"}
        />
      </form>
      <div className="ai-composer-bar">
        <ModelChip />
        <span className="ai-composer-end">
          {!disabled && <span className="ai-composer-hint">{busy ? "Esc to stop" : "Enter to send · Shift+Enter for new line"}</span>}
          {length >= COUNT_FROM && (
            <span className="ai-counter" data-tone={tone} aria-live="polite">
              {length.toLocaleString("en-US")} / {MAX_QUESTION.toLocaleString("en-US")}
            </span>
          )}
          {busy ? (
            <button type="button" onClick={stop} aria-label="Stop the answer" title="Stop (Esc)" className="ai-send" data-stop="">
              <Square className="size-3 fill-current" aria-hidden />
            </button>
          ) : (
            <button
              type="submit"
              form={formId}
              aria-label="Send"
              title={disabled ? (disabledReason ?? undefined) : opening ? "Opening the conversation…" : empty ? "Type a question first" : "Send (Enter)"}
              disabled={disabled || empty || opening}
              className="ai-send"
            >
              <ArrowUp className="size-4" strokeWidth={2.4} aria-hidden />
            </button>
          )}
        </span>
      </div>
    </div>
  );
});
