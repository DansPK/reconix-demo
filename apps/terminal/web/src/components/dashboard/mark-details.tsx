"use client";

/* A chart mark's details, expanded over its card: a heading, a close button and the entries
   (events, runs), scrolling inside when there are many. It takes focus when it opens; Esc or the
   close button closes it and the chart puts focus back on the mark (see `closeTo`). */
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function MarkDetails({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  return (
    <div
      role="dialog"
      aria-label={title}
      className="dash-details"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onClose();
      }}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border pb-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-foreground [overflow-wrap:anywhere]">{title}</p>
          {subtitle && <p className="font-mono text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close the details"
          title="Close (Esc)"
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>
      <div className="dash-details-body">
        {children}
      </div>
    </div>
  );
}

/** Focus the mark `key` inside `root` again once its details have closed. */
export function closeTo(root: HTMLElement | null, key: string): void {
  requestAnimationFrame(() => root?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus());
}
