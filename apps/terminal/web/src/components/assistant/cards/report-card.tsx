"use client";

/* Report downloads for the run in scope, straight from the export route (lib/report/formats.ts):
   PDF, JSON and DOCX. About every run, it first asks which run. */
import { useState } from "react";
import { ChevronDown, Download, FileText } from "lucide-react";
import { RUN_STATUS } from "@/lib/status";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CardOf, RunRef } from "@/lib/assistant/protocol";
import { RUN_UID } from "@/lib/assistant/protocol";
import { downloadHref, EXPORT_FORMATS } from "@/lib/report/formats";
import { cn } from "@/lib/utils";
import { CardShell, runName } from "./card-shell";
import { ViewLinkOut } from "./links";

function Downloads({ run }: { run: RunRef }) {
  if (!RUN_UID.test(run.uid)) return null;
  return (
    <div className="ai-formats" role="group" aria-label={`Download the report of ${runName(run)}`}>
      {EXPORT_FORMATS.map((f) => (
        <a key={f.id} href={downloadHref(run.uid, f.id)} download className="ai-format" title={f.blurb}>
          <Download className="size-3.5 text-primary" aria-hidden />
          {f.label}
        </a>
      ))}
    </div>
  );
}

export function ReportCard({ card }: { card: CardOf<"report"> }) {
  const [picked, setPicked] = useState<string | null>(null);
  if (card.runs.length === 1) {
    const { run, status } = card.runs[0];
    return (
      <CardShell
        icon={FileText}
        title="Report"
        meta={runName(run)}
        footer={
          <>
            <span>Made from the saved, masked data.</span>
            <ViewLinkOut uid={run.uid} view="reports" params={{}} label={`Open the Reports view of ${runName(run)}`}>
              Open in Reports
            </ViewLinkOut>
          </>
        }
      >
        <div className="ai-card-section">
          <div className="mb-2.5 flex items-center gap-2">
            <StatusBadge meaning={RUN_STATUS[status]} />
            {status !== "Completed" && <span className="text-[12px] text-muted-foreground">The report covers what this run did so far.</span>}
          </div>
          <Downloads run={run} />
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell icon={FileText} title="Report" meta="Which run? Reports are made per assessment.">
      <ul aria-label="Pick a run">
        {card.runs.map(({ run, status }) => {
          const open = picked === run.uid;
          return (
            <li key={run.uid} className="px-1.5">
              <button type="button" aria-expanded={open} onClick={() => setPicked(open ? null : run.uid)} className="ai-choice flex items-center gap-2.5 px-2.5 py-2">
                <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{runName(run)}</span>
                <StatusBadge meaning={RUN_STATUS[status]} />
              </button>
              {open && (
                <div className="flex flex-col gap-2 px-2.5 pb-3 pt-1">
                  <Downloads run={run} />
                  <ViewLinkOut uid={run.uid} view="reports" params={{}} label={`Open the Reports view of ${runName(run)}`} className="self-start">
                    Open in Reports
                  </ViewLinkOut>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {card.more > 0 && <p className="ai-card-empty">{card.more} older runs: open them from the assessment switcher.</p>}
    </CardShell>
  );
}
