"use client";

/* Combining saved runs into one report, in the Report view's all-runs mode: the Selection
   panel (the count, the options, Preview report, Generate PDF, Generate DOCX, Clear selection),
   the runs table with a checkbox per run (ReportRuns), and the preview frame (ReportPreview). The
   selection lives here, in state — never in the address — so it survives paging and searching
   the table.

   Preview fetches the HTML once and hands it to a fully sandboxed frame as `srcDoc` (so a
   refused or failed request shows as an error with Retry, and the report is built once).
   Generate PDF and Generate DOCX (report-file.tsx) are enabled once the preview of this exact
   selection and options was shown — both files hold what the preview shows, so it is seen before
   either is saved; each fetches its file, waits for the whole of it, then downloads that one
   blob. A 501 on the PDF (no browser to print with) offers the Word document instead; a 413 on
   the DOCX (DOCX_TOO_LARGE) says why. One request at a time: a change to the selection or the
   options aborts whatever is in flight, and answers to an older request are dropped. */
import { useId, useMemo, useState } from "react";
import { Eye, X } from "lucide-react";

import { DashCard } from "@/components/dashboard/dash-card";
import { COMBINED_FILE_IDS, FileStatus, type FileState, GenerateButton } from "@/components/dashboard/report-file";
import { ReportPreview, type PreviewState } from "@/components/dashboard/report-preview";
import { ReportRuns } from "@/components/dashboard/report-runs";
import type { ReportRunRow } from "@/components/dashboard/report-types";
import { describe, fetchFile, fetchWithin, useOneRequest } from "@/components/dashboard/use-file-download";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DOCS } from "@/lib/docs-nav";
import {
  COMBINE_MAX,
  COMBINE_OPTION_META,
  type CombineOptions,
  combinedFileName,
  combinedHref,
  DEFAULT_COMBINE_OPTIONS,
} from "@/lib/report/combined/options";
import type { ExportFormat } from "@/lib/report/formats";

const FETCH_TIMEOUT_MS = 15_000; // the HTML is built in milliseconds

export function ReportCombine({ runs }: { runs: ReportRunRow[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [options, setOptions] = useState<CombineOptions>(DEFAULT_COMBINE_OPTIONS);
  const [preview, setPreview] = useState<PreviewState>({ kind: "idle" });
  const [file, setFile] = useState<FileState>({ kind: "idle" });
  const { begin, abort: abortInflight } = useOneRequest(); // the one request allowed at a time
  const hintId = useId();
  const whyId = useId(); // why Preview / Generate can't act yet (each button's description)

  const chosen = useMemo(() => new Set(selected), [selected]);
  const uids = useMemo(() => [...selected].sort(), [selected]); // a,b and b,a are the same report
  const href = combinedHref(uids, "preview", options);
  const previewed = preview.kind === "shown" && preview.href === href;
  const stale = preview.kind !== "idle" && preview.href !== href;
  const busy = preview.kind === "loading" || file.kind === "generating";

  /** The selection or the options changed: nothing in flight is wanted any more. */
  const changed = () => {
    abortInflight();
    setPreview((p) => (p.kind === "loading" ? { kind: "idle" } : p));
    setFile({ kind: "idle" });
  };
  const toggle = (uid: string) => {
    setSelected((list) => (list.includes(uid) ? list.filter((u) => u !== uid) : list.length < COMBINE_MAX ? [...list, uid] : list));
    changed();
  };
  const setOption = (key: keyof CombineOptions, on: boolean) => {
    setOptions((o) => ({ ...o, [key]: on }));
    changed();
  };
  const clear = () => {
    setSelected([]);
    changed();
  };

  const showPreview = async () => {
    const { signal, mine, done } = begin();
    setPreview({ kind: "loading", href });
    try {
      const res = await fetchWithin(href, FETCH_TIMEOUT_MS, signal, "text/html");
      if (!mine()) return;
      if (!res.ok) {
        setPreview({ kind: "failed", href, message: await describe(res) });
        return;
      }
      const html = await res.text();
      if (!mine()) return;
      setPreview({ kind: "shown", href, html });
    } catch (error) {
      if (!mine()) return;
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      setPreview({ kind: "failed", href, message: timedOut ? "The dashboard took too long to build the report." : "The dashboard could not be reached." });
    } finally {
      done();
    }
  };

  const generate = (format: ExportFormat) => {
    if (format === "json") return; // the combined report is a PDF or a Word document
    const request = {
      format,
      href: combinedHref(uids, format, options),
      docx: combinedHref(uids, "docx", options),
      name: combinedFileName(uids.length, format, new Date()),
    };
    void fetchFile(request, begin(), setFile);
  };

  const none = selected.length === 0;
  const fileReason = none ? "Pick at least one run" : !previewed ? "Preview the report first" : null;
  // The buttons stay focusable while they can't act (aria-disabled), so focus is never dropped
  // when a click empties the selection or starts a request; the handlers check themselves.
  const previewBlocked = none || busy;
  const fileBlocked = Boolean(fileReason) || busy;

  return (
    <>
      <DashCard
        id="report-combine"
        title="Combine runs"
        docsHref={DOCS.exporting}
        meta={
          <span aria-live="polite">
            {selected.length} of {COMBINE_MAX} selected
          </span>
        }
        className="is-wide"
        bodyClassName="rep-select"
      >
        <p className="rep-help">
          Tick up to {COMBINE_MAX} runs in the table below, choose what to include, preview the report, then generate one PDF or one Word document (DOCX)
          with every run in it. A finding seen in several runs is counted once, with each run as an occurrence.
        </p>
        <fieldset className="rep-options">
          <legend className="rep-legend">Options</legend>
          {COMBINE_OPTION_META.map((o) => (
            <div key={o.key} className="rep-option">
              <Checkbox label={o.label} checked={options[o.key]} onChange={(e) => setOption(o.key, e.target.checked)} aria-describedby={`${hintId}-${o.key}`} />
              <span id={`${hintId}-${o.key}`} className="rep-hint">
                {o.hint}
              </span>
            </div>
          ))}
        </fieldset>
        <div className="rep-actions">
          <Button onClick={() => !previewBlocked && showPreview()} aria-disabled={previewBlocked || undefined} aria-describedby={`${whyId}-preview`}>
            <Eye className="size-3.5" aria-hidden /> {preview.kind === "loading" ? "Loading preview…" : "Preview report"}
          </Button>
          {COMBINED_FILE_IDS.map((format) => (
            <GenerateButton key={format} format={format} state={file} blocked={fileBlocked} describedBy={`${whyId}-file`} onGenerate={generate} />
          ))}
          <Button variant="quiet" onClick={() => !none && clear()} aria-disabled={none || undefined}>
            <X className="size-3.5" aria-hidden /> Clear selection
          </Button>
          <span id={`${whyId}-preview`} className="rep-reason">
            {none ? "Pick at least one run." : ""}
          </span>
          <span id={`${whyId}-file`} className="rep-reason">
            {fileReason && !none ? `${fileReason}.` : ""}
          </span>
        </div>
        <FileStatus state={file} onRetry={generate} />
      </DashCard>
      <ReportRuns runs={runs} selection={{ chosen, max: COMBINE_MAX, onToggle: toggle }} />
      {preview.kind !== "idle" && <ReportPreview state={preview} runs={selected.length} stale={stale} onRetry={showPreview} />}
    </>
  );
}
