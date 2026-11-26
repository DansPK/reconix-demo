"use client";

/* Ingest, in the page's header. A document uploaded here waits, not ingested (the AI Assistant
   cannot search it yet), until it is ingested:
   - "Ingest N new" (the main button while some wait) puts only the waiting documents into the
     knowledge search: quick.
   - "Re-ingest all" asks first, inline, then loads the built-in knowledge again (CVE, CWE,
     OWASP, ATT&CK, tool guides), embeds every document again and puts the waiting ones in:
     slower (minutes).
   The strip under the header shows the job's steps while it runs, and how it ended. */
import { useState } from "react";
import { CircleAlert, CircleCheck, DatabaseZap, Loader, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Reingest } from "@/lib/knowledge/client";

interface Props {
  job: Reingest | null;
  starting: boolean;
  error: string | null;
  documents: number;
  waiting: number;
  onStart: (scope: "NEW" | "ALL") => void;
}

export function ReingestButton({ job, starting, error, documents, waiting, onStart }: Props) {
  const [asking, setAsking] = useState(false);
  const busy = job?.status === "RUNNING" || starting;
  if (asking && !busy)
    return (
      <div className="kn-reingest-ask" role="group" aria-label="Re-ingest all knowledge?">
        <span>
          Reload the built-in knowledge and re-embed all {documents} {documents === 1 ? "document" : "documents"}? It takes a few minutes.
        </span>
        <Button
          size="xs"
          onClick={() => {
            setAsking(false);
            onStart("ALL");
          }}
        >
          Start
        </Button>
        <Button size="xs" variant="outline" autoFocus onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </div>
    );
  return (
    <>
      {error && <span className="kn-error">{error}</span>}
      <Button variant="outline" onClick={() => setAsking(true)} disabled={busy} title="Reload the built-in knowledge and re-embed every document">
        {busy && job?.scope === "ALL" ? <Loader className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
        Re-ingest all
      </Button>
      {waiting > 0 && (
        <Button onClick={() => onStart("NEW")} disabled={busy} className="kn-ingest-new" title="Put the documents that wait into the knowledge search">
          {busy && job?.scope === "NEW" ? <Loader className="size-3.5 animate-spin" aria-hidden /> : <DatabaseZap className="size-3.5" aria-hidden />}
          Ingest {waiting} new
        </Button>
      )}
    </>
  );
}

/** The job's progress, under the header, while it runs and once it ended (until dismissed). */
export function ReingestProgress({ job }: { job: Reingest | null }) {
  const [hidden, setHidden] = useState<string | null>(null);
  if (!job || job.status === "IDLE" || (job.status !== "RUNNING" && job.finished_at !== null && hidden === job.finished_at)) return null;
  const running = job.status === "RUNNING";
  const all = job.scope === "ALL";
  const second = job.step === "ADD_ONS";
  const share = second && job.add_ons_total ? job.add_ons_done / job.add_ons_total : null;
  const n = job.new_ingested;
  const title = running
    ? !all
      ? `Ingesting the new documents (${job.add_ons_done} of ${job.add_ons_total})`
      : second
        ? `Step 2 of 2 · Embedding your documents (${job.add_ons_done} of ${job.add_ons_total})`
        : "Step 1 of 2 · Loading the built-in knowledge (CVE, CWE, OWASP, ATT&CK, tool guides)"
    : job.status === "COMPLETED"
      ? all
        ? `Re-ingest done · ${job.public_pieces} built-in pieces · ${job.add_ons_done} ${job.add_ons_done === 1 ? "document" : "documents"} (${n} new)`
        : `Ingested ${n} ${n === 1 ? "document" : "documents"} · the AI Assistant can search ${n === 1 ? "it" : "them"} now`
      : `${all ? "Re-ingest" : "Ingest"} failed${all && !second ? " while loading the built-in knowledge" : ""}: ${job.error_message ?? job.error_code ?? "unknown error"}`;
  return (
    <div className="kn-reingest" data-status={job.status} role="status" aria-live="polite">
      <span className="kn-reingest-icon" aria-hidden>
        {running ? <Loader className="animate-spin" /> : job.status === "COMPLETED" ? <CircleCheck /> : <CircleAlert />}
      </span>
      <div className="kn-reingest-text">
        <p className="kn-reingest-title">{title}</p>
        {running && (
          <div className="kn-reingest-bar" data-indeterminate={share === null ? "" : undefined}>
            <span style={share === null ? undefined : { width: `${Math.max(4, share * 100)}%` }} />
          </div>
        )}
      </div>
      {!running && (
        <button type="button" className="kn-reingest-close" onClick={() => setHidden(job.finished_at)} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
