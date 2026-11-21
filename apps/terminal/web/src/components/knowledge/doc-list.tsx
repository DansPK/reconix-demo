"use client";

/* The Security knowledge page's left side: every ingested document, newest first, with a search
   over the names. A row shows the file type, the name, its passages and how many references and
   topics it links to; picking one focuses it in the graph (and picking it again lets go). The bin
   asks first, inline ("Remove <name>? The AI Assistant stops using it."), focused on Keep. */
import { useRef, useState } from "react";
import { Loader, Search, Trash2 } from "lucide-react";

import { addedAtLabel, humanSize, matchName } from "@/lib/knowledge/format";
import type { KnowledgeItem } from "@/lib/knowledge/types";
import { cleanSearchQuery, MAX_SEARCH_QUERY } from "@/lib/search";
import { cn } from "@/lib/utils";

import { KindIcon } from "./kind-icon";

interface Props {
  items: KnowledgeItem[];
  links: Record<string, number>; // references and topics shown per document
  focusId: string | null; // the document focused in the graph
  onPick: (item: KnowledgeItem) => void;
  onRemove: (item: KnowledgeItem) => Promise<string | null>;
}

export function DocList({ items, links, focusId, onPick, onRemove }: Props) {
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keep closes the question: the focus goes back to the bin that asked, not to the page
  const refocus = useRef<string | null>(null);
  const shown = matchName(items, query);

  const remove = async (item: KnowledgeItem) => {
    setBusy(true);
    const problem = await onRemove(item);
    setBusy(false);
    if (problem) setError(problem);
    else setAsking(null);
  };

  return (
    <div className="kn-docs">
      <label className="kn-docs-search">
        <Search aria-hidden />
        <input
          type="search"
          value={query}
          maxLength={MAX_SEARCH_QUERY}
          onChange={(e) => setQuery(cleanSearchQuery(e.target.value))}
          placeholder="Search documents"
          aria-label="Search documents by name"
          spellCheck={false}
        />
      </label>
      {shown.length === 0 ? (
        <p className="kn-docs-empty">{query.trim() ? `No document has “${query.trim()}” in its name.` : "No documents yet."}</p>
      ) : (
        <ul className="kn-docs-list" aria-label="Ingested documents">
          {shown.map((item, i) => {
            const focused = focusId === item.id;
            if (asking === item.id) {
              return (
                <li key={item.id} className="kn-doc is-asking" role="group" aria-label={`Remove ${item.name}?`}>
                  <p>
                    Remove <span className="font-medium">{item.name}</span>? The AI Assistant stops using it.
                  </p>
                  {error && <p className="kn-error">{error}</p>}
                  <div className="kn-doc-confirm">
                    <button type="button" onClick={() => void remove(item)} disabled={busy} className="ai-btn ai-btn-small ai-btn-danger-solid">
                      {busy && <Loader className="size-3.5 animate-spin" aria-hidden />}
                      Remove
                    </button>
                    <button
                      type="button"
                      autoFocus
                      disabled={busy}
                      onClick={() => {
                        refocus.current = item.id;
                        setAsking(null);
                        setError(null);
                      }}
                      className="ai-btn ai-btn-small ai-btn-outline"
                    >
                      Keep
                    </button>
                  </div>
                </li>
              );
            }
            return (
              <li key={item.id} className={cn("kn-doc ac-list-item", focused && "is-focused")} style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
                <button type="button" aria-pressed={focused} onClick={() => onPick(item)} className="kn-doc-main" title={focused ? "Show the whole graph" : "Show it in the graph"}>
                  <KindIcon kind={item.kind} />
                  <span className="kn-doc-text">
                    <span className="kn-doc-head">
                      <span className="kn-doc-name">{item.name}</span>
                      {!item.ingested && (
                        <span className="kn-status" title="Uploaded, not ingested yet: the AI Assistant cannot search it until you press Ingest">
                          Not ingested
                        </span>
                      )}
                    </span>
                    <span className="kn-doc-meta">
                      {item.chunks} {item.chunks === 1 ? "passage" : "passages"} · {links[item.id] ?? 0} links · {humanSize(item.bytes)} · {addedAtLabel(item.addedAt)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="kn-doc-remove"
                  ref={(el) => {
                    if (el && refocus.current === item.id) {
                      refocus.current = null;
                      el.focus();
                    }
                  }}
                  aria-label={`Remove ${item.name}`}
                  title="Remove"
                  onClick={() => {
                    setError(null);
                    setAsking(item.id);
                  }}
                >
                  <Trash2 aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
