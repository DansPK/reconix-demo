"use client";

/* The panel over the graph's corner for the focused node (a live region), with two tabs:

   - A document: Overview (type, size, passages, and what it talks about, as chips) and Content
     (its passages, masked by the API, with every reference and topic marked in its colour; a
     mark moves the focus to that reference; "Load more" reads the next page).
   - A reference or topic: About (what it is, from the API's built-in knowledge base: CVE, CWE,
     OWASP, ATT&CK, tool guides) and Mentions (each document that names it, with the sentences
     around it, marked; a document's name opens it at that passage).

   Nothing here is HTML from the server: every text is rendered as text. */
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader, X } from "lucide-react";

import * as api from "@/lib/knowledge/client";
import { documentsOf, type Graph, type GraphNode, TYPE_LABEL } from "@/lib/knowledge/graph";
import { matchedRanges, partsOf, type Span, snippetOf, splitHighlightSegments } from "@/lib/knowledge/highlight";

import type { Passages } from "./use-passages";

interface Props {
  graph: Graph;
  node: GraphNode;
  onFocus: (id: string | null) => void;
  passages: Passages;
  initialPart?: number | null;
  highlightAnswer?: string | null;
}

type Tab = "overview" | "content" | "about" | "mentions";

const docKey = (n: GraphNode) => n.id.slice(4); // "doc:<id>"
const refOf = (n: GraphNode) => ({ type: n.type, refId: n.id.slice(n.type.length + 1) });

/** Text with its references marked (and optionally sentences matched to an AI answer highlighted). */
function Marked({
  text,
  spans,
  onFocus,
  current,
  highlightAnswer,
}: {
  text: string;
  spans: readonly Span[];
  onFocus: (id: string) => void;
  current?: string;
  highlightAnswer?: string | null;
}) {
  const renderParts = (parts: ReturnType<typeof partsOf>) =>
    parts.map((p, i) =>
      p.span ? (
        <button
          key={i}
          type="button"
          className="kn-mark"
          data-type={p.span.type}
          data-current={current === `${p.span.type}:${p.span.ref_id}` ? "" : undefined}
          onClick={() => onFocus(`${p.span!.type}:${p.span!.ref_id}`)}
          title={`${TYPE_LABEL[p.span.type as keyof typeof TYPE_LABEL] ?? p.span.type}: ${p.span.ref_id}`}
        >
          {p.text}
        </button>
      ) : (
        <span key={i}>{p.text}</span>
      ),
    );

  if (!highlightAnswer) return <>{renderParts(partsOf(text, spans))}</>;
  const segments = splitHighlightSegments(text, spans, matchedRanges(text, highlightAnswer));
  return (
    <>
      {segments.map((seg, idx) =>
        seg.highlighted ? (
          <mark key={idx} className="kn-used">
            {renderParts(seg.parts)}
          </mark>
        ) : (
          <span key={idx}>{renderParts(seg.parts)}</span>
        ),
      )}
    </>
  );
}

function About({ node }: { node: GraphNode }) {
  const { type, refId } = refOf(node);
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; about: api.About; error: string | null }>({ status: "loading", about: null, error: null });
  useEffect(() => {
    let live = true;
    void api.loadAbout(type, refId, node.label).then((r) => {
      if (live) setState(r.ok ? { status: "ready", about: r.value, error: null } : { status: "error", about: null, error: r.detail });
    });
    return () => {
      live = false;
    };
  }, [type, refId, node.label]);
  if (state.status === "loading")
    return (
      <div className="kn-skeleton" role="status" aria-label="Asking the knowledge base">
        <span />
        <span />
        <span />
      </div>
    );
  if (state.status === "error") return <p className="kn-error">{state.error}</p>;
  if (!state.about) return <p className="kn-details-empty">The built-in knowledge base has no entry for {node.label}. Its mentions in your documents are under Mentions.</p>;
  return (
    <div className="kn-about">
      <p className="kn-about-title">{state.about.title}</p>
      <p className="kn-about-text">{state.about.text}</p>
      <p className="kn-about-source">
        From the built-in {state.about.source.replace(/_/g, " ")} knowledge
        {state.about.url && (
          <>
            {" · "}
            <a href={state.about.url} target="_blank" rel="noopener noreferrer" className="kn-about-link">
              Read more <ExternalLink aria-hidden />
            </a>
          </>
        )}
      </p>
    </div>
  );
}

export function GraphDetails({ graph, node, onFocus, passages, initialPart = null, highlightAnswer = null }: Props) {
  const doc = node.type === "DOC";
  const [tab, setTab] = useState<Tab>(doc ? (initialPart !== null ? "content" : "overview") : "about");
  const [scrollTo, setScrollTo] = useState<number | null>(null); // a mention picked: its passage
  const [target, setTarget] = useState<number | null>(doc ? initialPart : null); // the passage to scroll to here
  const scrolled = useRef<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const linked = [...(graph.neighbours.get(node.id) ?? [])].map((id) => graph.byId.get(id)!).sort((a, b) => b.weight - a.weight);
  const docs = useMemo(() => (doc ? [] : documentsOf(graph, node.id)), [doc, graph, node.id]);

  // a new node (or a deep-linked passage): its first tab (or Content, when a mention/source opened it)
  const shownKey = `${node.id}:${initialPart ?? ""}`;
  const [shownFor, setShownFor] = useState(shownKey);
  if (shownFor !== shownKey) {
    setShownFor(shownKey);
    const nextTarget = scrollTo ?? initialPart;
    setTab(doc ? (nextTarget !== null ? "content" : "overview") : "about");
    setTarget(doc ? nextTarget : null);
    setScrollTo(null);
  }

  // read what the tab shows
  const { load, all, ensure } = passages;
  useEffect(() => {
    if (tab === "content" && doc) {
      if (target !== null) ensure(docKey(node), target);
      else load(docKey(node));
    }
    if (tab === "mentions") for (const d of docs) all(docKey(d));
  }, [tab, node, doc, docs, target, load, all, ensure]);

  // a mention or source opened this document at one passage: scroll it into view once visible
  const mine = doc ? passages.content[docKey(node)] : undefined;
  useEffect(() => {
    const key = `${node.id}#${target}`;
    if (target === null || tab !== "content" || scrolled.current === key || !mine?.passages.some((p) => p.index === target)) return;
    const el = body.current?.querySelector<HTMLElement>(`[data-index="${target}"]`);
    if (!el) return;
    const scroll = () => {
      scrolled.current = key;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    const hiddenPane = el.closest<HTMLElement>("[hidden]");
    if (!hiddenPane) {
      scroll();
      return;
    }
    const observer = new MutationObserver(() => {
      if (hiddenPane.hasAttribute("hidden")) return;
      observer.disconnect();
      requestAnimationFrame(scroll);
    });
    observer.observe(hiddenPane, { attributes: true, attributeFilter: ["hidden"] });
    return () => observer.disconnect();
  }, [target, tab, mine, node.id]);

  const tabs: { id: Tab; label: string }[] = doc
    ? [
        { id: "overview", label: "Overview" },
        { id: "content", label: "Content" },
      ]
    : [
        { id: "about", label: "About" },
        { id: "mentions", label: `Mentions (${docs.length})` },
      ];

  return (
    <aside className="kn-details" data-type={node.type} aria-live="polite" aria-label={`${TYPE_LABEL[node.type]} details`}>
      <div className="kn-details-head">
        <span className="kn-type-dot" data-type={node.type} aria-hidden />
        <span className="kn-details-type">{TYPE_LABEL[node.type]}</span>
        <button type="button" onClick={() => onFocus(null)} aria-label="Close the details" className="kn-details-close">
          <X aria-hidden />
        </button>
      </div>
      <p className="kn-details-title">{node.label}</p>
      <p className="kn-details-sub">
        {doc
          ? `${node.sub} · links to ${linked.length} ${linked.length === 1 ? "reference" : "references and topics"}`
          : `Named in ${node.weight} ${node.weight === 1 ? "passage" : "passages"} of ${docs.length} ${docs.length === 1 ? "document" : "documents"}`}
      </p>
      {doc && (
        <p className="kn-details-status">
          <span className="kn-status" data-ingested={node.pending ? undefined : ""}>
            {node.pending ? "Not ingested" : "Ingested"}
          </span>
          {node.pending ? "The AI Assistant cannot search it until you press Ingest." : "The AI Assistant searches it."}
        </p>
      )}
      <div className="kn-tabs" role="tablist" aria-label="Details">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className="kn-tab">
            {t.label}
          </button>
        ))}
      </div>

      <div className="kn-details-body" ref={body} role="tabpanel">
        {tab === "overview" &&
          (linked.length ? (
            <>
              <p className="kn-details-label">Talks about</p>
              <ul className="kn-chips">
                {linked.slice(0, 30).map((n) => (
                  <li key={n.id}>
                    <button type="button" data-type={n.type} onClick={() => onFocus(n.id)} className="kn-chip" title={`${TYPE_LABEL[n.type]}: ${n.label}`}>
                      <span className="kn-type-dot" data-type={n.type} aria-hidden />
                      {n.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="kn-details-empty">It names no security reference or topic the graph knows.</p>
          ))}

        {tab === "content" &&
          (!mine || mine.status === "loading" ? (
            <div className="kn-skeleton" role="status" aria-label="Reading the document">
              <span />
              <span />
              <span />
              <span />
            </div>
          ) : (
            <>
              {mine.error && <p className="kn-error">{mine.error}</p>}
              <ol className="kn-passages">
                {mine.passages.map((p) => (
                  <li key={p.index} data-index={p.index} className={p.index === target ? "kn-passage is-found" : "kn-passage"}>
                    <span className="kn-passage-index">Part {p.index + 1}</span>
                    <p className="kn-passage-text">
                      <Marked
                        text={p.text}
                        spans={p.spans}
                        onFocus={onFocus}
                        highlightAnswer={p.index === target ? highlightAnswer : null}
                      />
                    </p>
                  </li>
                ))}
              </ol>
              {mine.passages.length < mine.total && (
                <button type="button" onClick={() => passages.more(docKey(node))} className="ai-btn ai-btn-small ai-btn-outline kn-more">
                  Load more ({mine.total - mine.passages.length} left)
                </button>
              )}
            </>
          ))}

        {tab === "about" && <About key={node.id} node={node} />}

        {tab === "mentions" && (
          <ul className="kn-mentions">
            {docs.map((d) => {
              const c = passages.content[docKey(d)];
              const { type, refId } = refOf(node);
              const hits = (c?.passages ?? []).flatMap((p) => {
                const s = snippetOf(p.text, p.spans, type, refId);
                return s ? [{ index: p.index, ...s }] : [];
              });
              return (
                <li key={d.id} className="kn-mention">
                  <button
                    type="button"
                    className="kn-mention-doc"
                    onClick={() => {
                      setScrollTo(hits[0]?.index ?? null);
                      onFocus(d.id);
                    }}
                  >
                    <span className="kn-type-dot" data-type="DOC" aria-hidden />
                    {d.label}
                  </button>
                  {!c || c.status === "loading" ? (
                    <Loader className="kn-mention-wait animate-spin" aria-label="Reading" />
                  ) : c.status === "error" ? (
                    <p className="kn-error">{c.error ?? "Could not read this document."}</p>
                  ) : hits.length === 0 ? (
                    <p className="kn-details-empty">Named in a part not read here.</p>
                  ) : (
                    hits.slice(0, 3).map((h) => (
                      <p key={h.index} className="kn-snippet">
                        <Marked text={h.text} spans={h.spans} onFocus={onFocus} current={node.id} />
                      </p>
                    ))
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
