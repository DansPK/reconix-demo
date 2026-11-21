"use client";

/* Small toasts: `toast(text, tone)` shows a short note at the bottom right for a few seconds
   (success or error), and <Toaster /> (mounted once, in the root layout) draws them. A screen
   reader hears each one: the stack is a polite live region named "Notifications" (not
   role="status", so it is never mistaken for a page's own status line). Text only: nothing in
   a toast is HTML. */
import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";

export type ToastTone = "success" | "error";
interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

const SHOWN_MS = 4_000;
const listeners = new Set<(toasts: Toast[]) => void>();
let toasts: Toast[] = [];
let next = 1;

const publish = () => listeners.forEach((l) => l(toasts));

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  publish();
}

/** Shows `text` for a few seconds. */
export function toast(text: string, tone: ToastTone = "success"): number {
  const id = next++;
  toasts = [...toasts.slice(-2), { id, text: text.slice(0, 300), tone }]; // three at most
  publish();
  setTimeout(() => dismiss(id), SHOWN_MS);
  return id;
}

export function Toaster() {
  const [shown, setShown] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.add(setShown);
    return () => {
      listeners.delete(setShown);
    };
  }, []);
  return (
    <section aria-label="Notifications" aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {shown.map((t) => (
        <div key={t.id} className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3 text-sm text-foreground shadow-lg">
          {t.tone === "success" ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
          <p className="min-w-0 flex-1 leading-snug break-words">{t.text}</p>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="shrink-0 rounded text-muted-foreground hover:text-foreground">
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </section>
  );
}
