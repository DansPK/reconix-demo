"use client";

/* The Assessments view kept fresh: starts from the rows the page read, then asks
   /api/core-assessments again every `everyMs` while the tab is visible and this view is the
   one shown, so a run starting, waiting or ending shows up without a reload. A failed poll
   keeps the last rows and says why; the next poll tries again. `everyMs` 0: no polling (the
   e2e server sets RECONIX_LIVE_REFRESH_MS=0). */
import { useEffect, useRef, useState } from "react";

import { AssessmentsView } from "@/components/dashboard/assessments-view";
import { plural } from "@/components/dashboard/derive-shared";
import type { ReportRunRow } from "@/components/dashboard/report-types";
import { ViewHeader } from "@/components/dashboard/view-header";
import { EmptyNote } from "@/components/ui/empty-note";
import { DOCS } from "@/lib/docs-nav";

const TIMEOUT_MS = 20_000;

async function poll(): Promise<ReportRunRow[]> {
  const res = await fetch("/api/core-assessments", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as { rows?: unknown; detail?: unknown } | null;
  if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : `The dashboard answered HTTP ${res.status}.`);
  if (!Array.isArray(body?.rows)) throw new Error("The dashboard sent rows it could not read.");
  return body.rows as ReportRunRow[];
}

export function LiveAssessments({ initial, everyMs }: { initial: ReportRunRow[]; everyMs: number }) {
  const [rows, setRows] = useState(initial);
  const [failed, setFailed] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // a whole-page refresh (the top bar's Live pill) brings newer rows: start from those
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setRows(initial);
  }

  useEffect(() => {
    if (everyMs <= 0) return;
    let busy = false;
    const refresh = async () => {
      // a hidden pane (another view is open) has no offsetParent
      if (busy || document.visibilityState !== "visible" || !box.current?.offsetParent) return;
      busy = true;
      try {
        setRows(await poll());
        setFailed(null);
      } catch (e) {
        setFailed(e instanceof Error && e.name !== "TimeoutError" ? e.message : "The dashboard didn't answer in time.");
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void refresh(), everyMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [everyMs]);

  const note = failed ? (
    <div className="dash-view pt-3 pb-0">
      <p role="status" className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
        Live update failed, showing the last rows: {failed}
      </p>
    </div>
  ) : null;

  return (
    <div ref={box}>
      {rows.length === 0 ? (
        <div className="dash-view dash-sheet">
          <ViewHeader title="Assessments" about="Assessments from the Core API." docsHref={DOCS.panelAssessments} />
          {note}
          <EmptyNote status>The Core API holds no assessment yet. Start one in the TUI.</EmptyNote>
        </div>
      ) : (
        <>
          {note}
          <AssessmentsView
            data={{
              tag: `All ${plural(rows.length, "run")}`,
              about:
                rows.length === 1
                  ? "The one run the Core API holds: open it for its overview, findings and report."
                  : "Every assessment the Core API holds: search or filter them, and open one for its overview, findings and report.",
              rows,
            }}
          />
        </>
      )}
    </div>
  );
}
