"use client";

/* Every saved run as a row of the Report view (newest first): the shared cells (run-cells.tsx;
   the run's name opens that run's report) and its report to download in every export format
   (PDF, JSON and DOCX: EXPORT_FORMATS, the same three the TUI saves), fetched then saved, with
   one status line under the table naming the run (report-downloads.tsx). A search
   narrows the rows by ID, template, target or status; ten rows show at a time. With a
   `selection`, each row gets a checkbox to put the run in the combined report
   (report-selection.tsx owns which are chosen); once the most are chosen, the others are
   disabled and say why. */
import { useState } from "react";

import { DashCard } from "@/components/dashboard/dash-card";
import { SearchField } from "@/components/dashboard/filter-bar";
import { runMatches } from "@/components/dashboard/filters";
import { ExportButtons, exportRequest } from "@/components/dashboard/report-downloads";
import { FileStatus } from "@/components/dashboard/report-file";
import type { ReportRunRow } from "@/components/dashboard/report-types";
import { RUN_COLUMNS, RUN_SEARCH, RunCells, type RunCellProps, runTitle } from "@/components/dashboard/run-cells";
import { RunLinkTo } from "@/components/dashboard/run-link";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyNote } from "@/components/ui/empty-note";
import { Pagination } from "@/components/ui/pagination";
import { DOCS } from "@/lib/docs-nav";
import { paginate, slicePage } from "@/lib/paging";
import { useFileDownload } from "@/components/dashboard/use-file-download";

const SEARCH_FROM = 7; // runs before a search field is worth it
// status is positioned: its sr-only "waiting on" text then overflows the table's scroller, not the page
const CELL_CLASS: Partial<Record<RunCellProps["column"], string>> = { target: "max-w-[220px]", status: "relative", plan: "text-right" };

/** A table cell: the run's name is the row header. */
function Cell({ column, title, children }: RunCellProps) {
  if (column === "run") return <th scope="row" className="font-normal">{children}</th>;
  return (
    <td title={title} className={CELL_CLASS[column]}>
      {children}
    </td>
  );
}

export interface RunSelection {
  chosen: ReadonlySet<string>; // uids
  max: number;
  onToggle: (uid: string) => void;
}

export function ReportRuns({ runs, selection }: { runs: ReportRunRow[]; selection?: RunSelection }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const { file, download, retry } = useFileDownload();
  const q = query.trim().toLowerCase();
  const shown = runs.filter((r) => runMatches(r, q));
  const paging = paginate(shown.length, page);
  const rows = slicePage(shown, paging);
  const full = selection ? selection.chosen.size >= selection.max : false;
  return (
    <DashCard
      id="report-runs"
      title="Runs"
      docsHref={DOCS.exporting}
      meta={shown.length === runs.length ? `${runs.length} saved` : `${shown.length} of ${runs.length}`}
      className="is-wide"
      bodyClassName="flex flex-col gap-3"
    >
      {runs.length >= SEARCH_FROM && (
        <div className="w-full sm:w-[280px]">
          <SearchField
            label={RUN_SEARCH.label}
            placeholder={RUN_SEARCH.placeholder}
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
          />
        </div>
      )}
      <div className="dash-table-scroll">
        <table aria-label="Saved assessments" className="dash-table">
          <thead>
            <tr>
              {selection && (
                <th scope="col">
                  <span className="sr-only">Combine</span>
                </th>
              )}
              {RUN_COLUMNS.map((c) => (
                <th key={c.key} scope="col" className={CELL_CLASS[c.key]}>
                  {c.label}
                </th>
              ))}
              <th scope="col">Download</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const picked = selection?.chosen.has(r.uid) ?? false;
              return (
                <tr key={r.uid} data-selected={picked || undefined}>
                  <RunCells
                    row={r}
                    Cell={Cell}
                    name={(children) => (
                      <RunLinkTo uid={r.uid} label={`Open the report of ${runTitle(r)}`} className="block whitespace-nowrap text-foreground hover:text-primary">
                        {children}
                      </RunLinkTo>
                    )}
                    before={
                      selection && (
                        <td className="w-6">
                          <Checkbox
                            label={<span className="sr-only">{`Combine ${runTitle(r)}`}</span>}
                            checked={picked}
                            disabled={!picked && full}
                            reason={`${selection.max} already selected`}
                            onChange={() => selection.onToggle(r.uid)}
                            className="rep-pick"
                          />
                        </td>
                      )
                    }
                    after={
                      <td>
                        <span className="flex gap-1.5">
                          <ExportButtons
                            uid={r.uid}
                            busy={file.kind === "generating" && file.of === runTitle(r) ? file.format : null}
                            onDownload={(uid, format) => download(exportRequest(uid, format, runTitle(r)))}
                            label={(title) => `Download the ${title} of ${r.id} (${r.when})`}
                            className="h-[24px] px-2 text-[11px]"
                          />
                        </span>
                      </td>
                    }
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <FileStatus state={file} onRetry={retry} />
      {shown.length === 0 && <EmptyNote>No saved assessment matches.</EmptyNote>}
      <Pagination paging={paging} onPage={setPage} label="Saved assessment pages" />
    </DashCard>
  );
}
