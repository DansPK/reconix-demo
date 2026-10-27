"use client";

/* "↓ New messages": shown while the reader has scrolled up a conversation (useStickToBottom's
   `atBottom` is false); a click calls its `scrollToBottom`. The parent positions it OVER the
   scroller's bottom edge (e.g. absolute in a relative wrapper around the log), not inside the
   scrolling content, so it never takes space from the last message. It is gone while following,
   so it never covers the newest line. */
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ScrollToBottom({ show, onClick, className }: { show: boolean; onClick: () => void; className?: string }) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => onClick()}
      title="Scroll to the latest message"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs text-foreground shadow-lg transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <ArrowDown className="size-3.5" aria-hidden /> New messages
    </button>
  );
}
