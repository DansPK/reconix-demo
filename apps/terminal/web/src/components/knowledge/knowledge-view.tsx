"use client";

/* Security knowledge (`?view=knowledge`, opened from the AI Assistant's header):
   the documents the AI Assistant may quote, the ones uploaded here and the ones the TUI's /add-on
   added, newest first. The header: "← AI Assistant" (back to the assistant), the title, a search
   over the names, Table / Grid (remembered per browser) and Upload (upload-dialog.tsx). The files
   show ten a page (lib/paging.ts) as a table or as cards; each opens its original or is removed
   (asked first). Nothing here reads a file: the list, the uploads, the originals and the removals
   are the /api/knowledge routes, which hand every change to the Python /add-on code. */
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader } from "lucide-react";

import { DashCard } from "@/components/dashboard/dash-card";
import { FilterSummary, SearchField } from "@/components/dashboard/filter-bar";
import { ViewHeader } from "@/components/dashboard/view-header";
import { openAssistant, parseView } from "@/components/dashboard/view-url";
import { Button } from "@/components/ui/button";
import { EmptyNote } from "@/components/ui/empty-note";
import { Pagination } from "@/components/ui/pagination";
import { DOCS } from "@/lib/docs-nav";
import { matchName } from "@/lib/knowledge/format";
import { paginate, slicePage } from "@/lib/paging";

import { FileGrid } from "./file-grid";
import { FileTable } from "./file-table";
import { LayoutSwitch } from "./layout-switch";
import { useKnowledge } from "./use-knowledge";
import { useLayout } from "./use-layout";

export const KNOWLEDGE_ABOUT = "Reference documents the AI Assistant can quote when they match a question.";

export function KnowledgeView() {
  const shown = parseView(useSearchParams().get("view")) === "knowledge";
  const { state, reload } = useKnowledge(shown);
  const [layout, setLayout] = useLayout();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const top = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);

  const listing = state.listing;
  const items = listing?.items ?? [];
  const found = matchName(items, query);
  const paging = paginate(found.length, page);
  const rows = slicePage(found, paging);

  const search = (q: string) => {
    setQuery(q);
    setPage(1);
  };

  return (
    <div className="dash-view dash-sheet kn-view" ref={top}>
      <div>
        <Button variant="quiet" size="xs" onClick={() => openAssistant()} className="kn-back" title="Back to the AI Assistant">
          <ArrowLeft className="size-3.5" aria-hidden />
          AI Assistant
        </Button>
      </div>
      <ViewHeader title="Security knowledge" about={KNOWLEDGE_ABOUT}>
        <div className="kn-search">
          <SearchField label="Search knowledge files by name" placeholder="Search by name" value={query} onChange={search} />
        </div>
        <LayoutSwitch layout={layout} onChange={setLayout} />
      </ViewHeader>

      {state.error && listing && (
        <p role="alert" className="kn-error">
          Couldn&apos;t refresh the list: {state.error}
        </p>
      )}

      <DashCard
        id="knowledge-files"
        title="Knowledge files"
        docsHref={DOCS.knowledge}
        meta={listing && items.length ? `${items.length} of ${listing.max} files` : undefined}
        ref={card}
        tabIndex={-1}
        className="kn-card"
        bodyClassName="flex flex-col gap-3"
      >
        {state.status === "loading" ? (
          <p role="status" className="kn-state">
            <Loader className="mr-1.5 inline size-3.5 animate-spin" aria-hidden /> Loading knowledge files…
          </p>
        ) : state.status === "error" ? (
          <div role="alert" className="ui-empty">
            <span>Couldn&apos;t load the knowledge files: {state.error}</span>
            <Button variant="outline" size="xs" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : listing?.state === "refused" ? (
          <p role="alert" className="ui-empty">
            The knowledge folder failed a safety check (it is a link, someone else&apos;s, or writable by others), so nothing is
            listed and the AI Assistant uses none of it. Make it yours and private (0700), then reload.
          </p>
        ) : items.length === 0 ? (
          <div className="ui-empty kn-empty">
            <p>
              No knowledge files yet. Documents added in the terminal with /add-on appear here; their
              text is masked and split into passages the AI Assistant quotes when they match a question.
            </p>
          </div>
        ) : (
          <>
            {query && <FilterSummary shown={found.length} total={items.length} noun="file" active onClear={() => search("")} />}
            {found.length === 0 ? (
              <EmptyNote status>
                No knowledge file has “{query.trim()}” in its name.
                <Button variant="outline" size="xs" onClick={() => search("")}>
                  Clear the search
                </Button>
              </EmptyNote>
            ) : layout === "grid" ? (
              <FileGrid items={rows} />
            ) : (
              <FileTable items={rows} />
            )}
            <Pagination paging={paging} onPage={setPage} label="Knowledge file pages" scrollTarget={top} />
          </>
        )}
      </DashCard>
    </div>
  );
}
