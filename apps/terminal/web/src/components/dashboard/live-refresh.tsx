"use client";

/* Re-reads the saved assessments every `everyMs` (10 s by default; the server reads
   RECONIX_LIVE_REFRESH_MS through lib/live-refresh.ts, 0 turns it off, as the e2e server does) while the tab is visible, so
   a run going on in the TUI shows up without a reload. Click to pause.
   The refresh re-renders the server views and keeps client state, so an open conversation and
   the chosen view survive it. */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { DEFAULT_REFRESH_MS } from "@/lib/live-refresh";

export function LiveRefresh({ renderedAt, dir, everyMs = DEFAULT_REFRESH_MS }: { renderedAt: string; dir: string; everyMs?: number }) {
  const router = useRouter();
  const [live, setLive] = useState(everyMs > 0);
  const seconds = Math.round(everyMs / 1000);

  useEffect(() => {
    if (!live || everyMs <= 0) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => window.clearInterval(timer);
  }, [live, everyMs, router]);

  if (everyMs <= 0) {
    return (
      <span
        data-live-refresh="off"
        title={`Live refresh is off (RECONIX_LIVE_REFRESH_MS). Reload to read ${dir} again.`}
        className="dash-reveal hidden shrink-0 items-center gap-2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground md:flex"
      >
        <span aria-hidden className="inline-block size-1.5 rounded-full bg-muted-foreground" />
        <span>Updated {renderedAt}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={live}
      onClick={() => setLive((v) => !v)}
      data-live-refresh={live ? "on" : "paused"}
      title={live ? `Reading ${dir} every ${seconds} seconds. Click to pause.` : `Paused. Click to read ${dir} every ${seconds} seconds.`}
      className="dash-reveal hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-md font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex"
    >
      <span
        aria-hidden
        className={live ? "dash-livedot inline-block size-1.5 rounded-full" : "inline-block size-1.5 rounded-full bg-muted-foreground"}
      />
      <span>
        {live ? "Live" : "Paused"} · {renderedAt}
      </span>
    </button>
  );
}
