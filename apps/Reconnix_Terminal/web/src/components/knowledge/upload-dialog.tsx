"use client";

/* "Upload a knowledge file": a modal dialog (the native <dialog>: focus kept inside, Escape
   closes, focus back on Upload afterwards) with one file input. The file is checked here first
   (type and size, lib/knowledge/rules.ts; a .doc is told to become a .docx: Upload stays
   unavailable until another file is chosen), then sent with its progress shown; once sent, the
   server reads it ("Reading the file…"). A refusal keeps the dialog open with the server's message
   (Upload tries again); success closes it and the page says what was added. While a file is on
   its way the dialog can't be closed (the server would add it anyway). */
import { useEffect, useId, useRef, useState } from "react";
import { Loader, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { uploadKnowledge } from "@/lib/knowledge/client";
import { humanSize } from "@/lib/knowledge/format";
import { MAX_UPLOAD_LABEL, UPLOAD_ACCEPT, UPLOAD_TYPES, uploadProblem } from "@/lib/knowledge/rules";
import type { KnowledgeItem } from "@/lib/knowledge/types";

type Phase = { at: "choose" } | { at: "sending"; sent: number } | { at: "reading" };

export function UploadDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (item: KnowledgeItem) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null); // the page's own check of the file
  const [refusal, setRefusal] = useState<string | null>(null); // the server's answer
  const [phase, setPhase] = useState<Phase>({ at: "choose" });
  const busy = phase.at !== "choose";
  const error = problem ?? refusal;
  const id = useId();

  // the dialog follows `open`
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const reset = () => {
    setFile(null);
    setProblem(null);
    setRefusal(null);
    setPhase({ at: "choose" });
    if (input.current) input.current.value = "";
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const choose = (chosen: File | null) => {
    setFile(chosen);
    setRefusal(null);
    setProblem(chosen ? uploadProblem(chosen) : null);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || busy || problem) return;
    setRefusal(null);
    setPhase({ at: "sending", sent: 0 });
    const result = await uploadKnowledge(file, (sent) => setPhase(sent >= 1 ? { at: "reading" } : { at: "sending", sent }));
    setPhase({ at: "choose" });
    if (!result.ok) return setRefusal(result.detail);
    reset();
    onAdded(result.value);
    onClose();
  };

  const percent = phase.at === "sending" ? Math.round(phase.sent * 100) : 100;
  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-about`}
      className="kn-dialog"
      onCancel={(e) => {
        e.preventDefault(); // Escape: through close(), which waits while a file is on its way
        close();
      }}
      onClose={() => {
        // closed by the browser after all (a second Escape can't be held): the page follows
        if (!open) return;
        if (!busy) reset();
        onClose();
      }}
    >
      <form onSubmit={send} className="kn-dialog-body" aria-busy={busy}>
        <header className="kn-dialog-head">
          <h2 id={`${id}-title`} className="kn-dialog-title">
            Upload a knowledge file
          </h2>
          <IconButton label="Close" onClick={close} disabled={busy} className="size-7">
            <X aria-hidden />
          </IconButton>
        </header>
        <p id={`${id}-about`} className="kn-dialog-text">
          The AI Assistant quotes the passages that match a question. Secrets in the text are masked before it is saved, and the
          original is kept encrypted on this computer.
        </p>

        <div className="kn-field">
          <label htmlFor={`${id}-file`} className="kn-label">
            File
          </label>
          <input
            ref={input}
            id={`${id}-file`}
            type="file"
            accept={UPLOAD_ACCEPT}
            disabled={busy}
            aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
            aria-invalid={problem ? true : undefined}
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
            className="kn-file"
          />
          <p id={`${id}-hint`} className="kn-hint">
            {UPLOAD_TYPES}, up to {MAX_UPLOAD_LABEL}.
          </p>
        </div>

        {file && !problem && !busy && (
          <p className="kn-chosen">
            <span className="kn-chosen-name">{file.name}</span> · {humanSize(file.size)}
          </p>
        )}

        {busy && (
          <div className="kn-field">
            <progress className="kn-progress" max={100} value={percent} aria-label={`Uploading ${file?.name ?? "the file"}`} />
            <p className="kn-hint" role="status">
              {phase.at === "sending" ? (
                <>
                  Uploading…<span aria-hidden> {percent}%</span>
                </>
              ) : (
                <>
                  <Loader className="mr-1.5 inline size-3.5 animate-spin" aria-hidden />
                  Reading the file and masking secrets…
                </>
              )}
            </p>
          </div>
        )}

        {error && (
          <p id={`${id}-error`} role="alert" className="kn-error">
            {error}
          </p>
        )}

        <footer className="kn-dialog-foot">
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          {/* aria-disabled while sending: it keeps the focus, and send() waits */}
          <Button type="submit" disabled={!file || !!problem} aria-disabled={busy || undefined}>
            {busy ? <Loader className="size-3.5 animate-spin" aria-hidden /> : <Upload className="size-3.5" aria-hidden />}
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
