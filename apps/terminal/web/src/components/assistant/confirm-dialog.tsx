"use client";

/* A small confirm dialog in the middle of the screen: the browser's modal <dialog> (its top
   layer: centred, the page dimmed behind it and inert, focus kept inside). It is rendered inside
   the model picker, so a click in it never closes the picker. The first button (Cancel) has
   focus; Escape or a click on the dimmed backdrop cancels. `tone` "danger" shows a red icon and
   a red confirm button, "info" an amber one. */
import { useEffect, useId, useRef } from "react";
import { Info, Loader, Trash2 } from "lucide-react";

interface Props {
  tone: "danger" | "info";
  title: string;
  children: React.ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({ tone, title, children, cancelLabel, confirmLabel, busy = false, error, onCancel, onConfirm }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-text`}
      className="ai-dialog"
      data-tone={tone}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault(); // only the dialog goes: the picker stays open
        e.stopPropagation();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel(); // the dimmed backdrop
      }}
    >
      <div className="ai-dialog-body">
        <span className="ai-dialog-icon" aria-hidden>
          {tone === "danger" ? <Trash2 className="size-5" /> : <Info className="size-5" />}
        </span>
        <h2 id={`${id}-title`} className="ai-dialog-title">
          {title}
        </h2>
        <div id={`${id}-text`} className="ai-dialog-text">
          {children}
        </div>
        {error && (
          <p className="ai-picker-refusal w-full text-left" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="ai-dialog-actions">
        <button type="button" autoFocus onClick={onCancel} className="ai-btn ai-btn-outline">
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={`ai-btn ${tone === "danger" ? "ai-dialog-danger" : "ai-btn-primary"}`}>
          {busy && <Loader className="size-3.5 animate-spin" aria-hidden />}
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
