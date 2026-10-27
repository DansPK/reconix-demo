"use client";

/* The combined report's preview: the HTML the route served, shown through `srcDoc` in a fully
   sandboxed <iframe> (no scripts, an opaque origin; the page's CSP applies inside) that scrolls
   inside itself. A loading state while the report is fetched, an error state with Retry when the
   fetch fails, and a note when the selection or options changed since this preview was shown.
   The card (a region named by its heading) takes focus when it appears, so the keyboard and
   screen readers land on it. */
import { useEffect, useRef } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { DashCard } from "@/components/dashboard/dash-card";
import { plural } from "@/components/dashboard/derive-shared";
import { Button } from "@/components/ui/button";
import { DOCS } from "@/lib/docs-nav";
import { revealTop } from "@/lib/scroll";

export type PreviewState =
  | { kind: "idle" }
  | { kind: "loading"; href: string }
  | { kind: "shown"; href: string; html: string }
  | { kind: "failed"; href: string; message: string };

export function ReportPreview({ state, runs, stale, onRetry }: { state: Exclude<PreviewState, { kind: "idle" }>; runs: number; stale: boolean; onRetry: () => void }) {
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    revealTop(el, { when: "always", behavior: reduced ? "instant" : "smooth" });
    el.focus({ preventScroll: true });
  }, []);
  const loading = state.kind === "loading";
  return (
    <DashCard
      ref={card}
      tabIndex={-1}
      id="report-preview"
      title="Preview"
      docsHref={DOCS.exporting}
      meta={`${plural(runs, "run")} · exactly what the PDF prints`}
      className="is-wide rep-preview-card"
    >
        {state.kind === "failed" ? (
          <div role="alert" className="rep-error">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <span>The preview could not be loaded: {state.message}</span>
            <Button variant="outline" size="xs" onClick={onRetry}>
              <RefreshCw className="size-3.5" aria-hidden /> Retry
            </Button>
          </div>
        ) : (
          <div className="rep-frame-wrap" aria-busy={loading}>
            {state.kind === "shown" && <iframe title="Combined report preview" sandbox="" srcDoc={state.html} className="rep-frame" />}
            {loading && (
              <div role="status" className="rep-frame-note">
                Loading the preview…
              </div>
            )}
          </div>
        )}
        {stale && state.kind !== "failed" && (
          <p className="rep-note" role="status">
            The selection or the options changed since this preview. Preview again before generating the PDF or the DOCX.
          </p>
        )}
    </DashCard>
  );
}
