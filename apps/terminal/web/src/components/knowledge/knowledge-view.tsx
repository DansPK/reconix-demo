"use client";

/* Security knowledge (`?view=knowledge`, opened from the AI Assistant's header): the documents
   the AI Assistant's agent searches, kept by the Core API (/knowledge-add-ons), and a graph of
   what they talk about. Left, the documents (doc-list.tsx: search, pick, remove); right, the graph
   (knowledge-graph.tsx) with its legend and filter (graph-legend.tsx) and the focused node's
   details (graph-details.tsx). Picking a document in the list focuses it in the graph, and a
   click in the graph does the same. Upload (upload-dialog.tsx) adds one; the graph follows. */
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Network, Upload } from "lucide-react";

import { KnowledgeStageSkeleton } from "@/components/dashboard/page-skeletons";
import { ViewHeader } from "@/components/dashboard/view-header";
import { openAssistant, useCurrentView } from "@/components/dashboard/view-url";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { getCitedAnswer } from "@/lib/assistant/cited-answer";
import { buildGraph, type RefType, REF_TYPES } from "@/lib/knowledge/graph";
import type { KnowledgeGraphAnswer } from "@/lib/knowledge/client";
import { MAX_UPLOAD_LABEL, UPLOAD_TYPES } from "@/lib/knowledge/rules";
import type { KnowledgeItem } from "@/lib/knowledge/types";

import { DocList } from "./doc-list";
import { GraphDetails } from "./graph-details";
import { GraphLegend } from "./graph-legend";
import { KnowledgeGraph } from "./knowledge-graph";
import { UploadDialog } from "./upload-dialog";
import { useKnowledgeGraph } from "./use-knowledge-graph";
import { usePassages } from "./use-passages";
import { ReingestButton, ReingestProgress } from "./reingest-panel";
import { useReingest } from "./use-reingest";

export const KNOWLEDGE_ABOUT = "The documents the AI Assistant searches, and how they connect: the CVEs, CWEs, OWASP risks, ATT&CK techniques, tools and topics they mention.";

const docNode = (id: string) => `doc:${id}`;

export function KnowledgeView({ initialData = null }: { initialData?: KnowledgeGraphAnswer | null } = {}) {
  const search = useSearchParams();
  const shown = useCurrentView() === "knowledge";
  const docParam = shown ? search.get("doc") : null;
  const partParam = shown ? search.get("part") : null;
  const parsedPart = partParam && /^[1-9]\d*$/.test(partParam) ? Number(partParam) - 1 : null;
  const urlKey = docParam ? `${docParam}:${partParam ?? ""}` : null;

  const { state, reload, remove, added } = useKnowledgeGraph(shown, initialData);
  const passages = usePassages();
  const afterReingest = useCallback(() => {
    for (const id of Object.keys(passages.content)) passages.forget(id);
    reload();
  }, [passages, reload]);
  const reingest = useReingest(shown, afterReingest);
  const [uploading, setUploading] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(docParam ? docNode(docParam) : null);
  const [initialPart, setInitialPart] = useState<number | null>(docParam ? parsedPart : null);
  const [urlSync, setUrlSync] = useState<string | null>(urlKey);
  if (urlSync !== urlKey) {
    setUrlSync(urlKey);
    setFocusId(docParam ? docNode(docParam) : null);
    setInitialPart(docParam ? parsedPart : null);
  }
  const [types, setTypes] = useState<ReadonlySet<RefType>>(() => new Set(REF_TYPES));
  const [sharedOnly, setSharedOnly] = useState(false);
  const [expanded, setExpanded] = useState(false); // the graph takes the whole stage; the list folds away

  const data = state.data;
  const items = useMemo(() => data?.items ?? [], [data]);
  const graph = useMemo(
    () =>
      buildGraph(
        items.map((i) => ({ id: i.id, name: i.name, kind: i.kind, chunks: i.chunks, ingested: i.ingested })),
        data?.references ?? {},
        types,
        sharedOnly,
      ),
    [items, data, types, sharedOnly],
  );
  const counts = useMemo(() => {
    const c = Object.fromEntries(REF_TYPES.map((t) => [t, 0])) as Record<RefType, number>;
    const seen = new Set<string>();
    for (const refs of Object.values(data?.references ?? {}))
      for (const r of refs) {
        const id = `${r.type}:${r.ref_id}`;
        if (!seen.has(id)) {
          seen.add(id);
          c[r.type] += 1;
        }
      }
    return c;
  }, [data]);
  const links = useMemo(() => Object.fromEntries(items.map((i) => [i.id, graph.neighbours.get(docNode(i.id))?.size ?? 0])), [items, graph]);
  const focusNode = focusId ? (graph.byId.get(focusId) ?? null) : null;
  const focusDoc = focusNode?.type === "DOC" ? focusNode.id.slice(4) : null;
  const highlightAnswer =
    focusDoc && focusDoc === docParam && initialPart === parsedPart
      ? getCitedAnswer(docParam, parsedPart !== null ? parsedPart + 1 : null)
      : null;
  const refCount = graph.nodes.length - items.length;

  const onFocus = useCallback(
    (id: string | null) => {
      setFocusId(id);
      setInitialPart(null);
    },
    [setFocusId, setInitialPart],
  );
  const pick = (item: KnowledgeItem) => {
    setFocusId((f) => (f === docNode(item.id) ? null : docNode(item.id)));
    setInitialPart(null);
  };
  const toggle = (t: RefType) =>
    setTypes((s) => {
      const next = new Set(s);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  const onRemove = async (item: KnowledgeItem) => {
    const problem = await remove(item);
    if (!problem) {
      passages.forget(item.id);
      if (focusId === docNode(item.id)) {
        setFocusId(null);
        setInitialPart(null);
      }
      toast(`Removed “${item.name}”. The AI Assistant no longer uses it.`);
    }
    return problem;
  };
  const onAdded = (item: KnowledgeItem) => {
    toast(
      item.ingested
        ? `Added “${item.name}” (${item.chunks} ${item.chunks === 1 ? "passage" : "passages"}). It is in the graph now.`
        : `Added “${item.name}” (${item.chunks} ${item.chunks === 1 ? "passage" : "passages"}), not ingested yet: press Ingest to let the AI Assistant search it.`,
    );
    added();
    setFocusId(docNode(item.id));
    setInitialPart(null);
  };

  return (
    <div className="dash-view kn-view">
      <div>
        <Button variant="quiet" size="xs" onClick={() => openAssistant()} className="kn-back" title="Back to the AI Assistant">
          <ArrowLeft className="size-3.5" aria-hidden />
          AI Assistant
        </Button>
      </div>
      <ViewHeader title="Security knowledge" about={KNOWLEDGE_ABOUT}>
        <ReingestButton
          job={reingest.job}
          starting={reingest.starting}
          error={reingest.error}
          documents={items.length}
          waiting={items.filter((i) => !i.ingested).length}
          onStart={(scope) => void reingest.start(scope)}
        />
        <Button onClick={() => setUploading(true)} aria-haspopup="dialog">
          <Upload className="size-3.5" aria-hidden />
          Upload
        </Button>
      </ViewHeader>
      <ReingestProgress job={reingest.job} />
      {state.error && data && (
        <p role="alert" className="kn-error">
          Couldn&apos;t refresh: {state.error}
        </p>
      )}

      {state.status === "loading" ? (
        <KnowledgeStageSkeleton />
      ) : state.status === "error" ? (
        <div className="kn-stage kn-stage-state" role="alert">
          <p>Couldn&apos;t load the knowledge: {state.error}</p>
          <Button variant="outline" size="xs" onClick={reload}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="kn-stage kn-stage-state">
          <span className="kn-empty-orb" aria-hidden>
            <Network />
          </span>
          <p className="kn-empty-title">No knowledge yet</p>
          <p className="kn-empty-text">
            Upload a document ({UPLOAD_TYPES}, up to {MAX_UPLOAD_LABEL}). Its text is masked and split into passages the AI Assistant searches, and it shows up here,
            linked to the CVEs, CWEs, OWASP risks, techniques, tools and topics it mentions.
          </p>
          <Button onClick={() => setUploading(true)} aria-haspopup="dialog">
            <Upload className="size-3.5" aria-hidden />
            Upload a document
          </Button>
        </div>
      ) : (
        <div className="kn-stage" data-expanded={expanded ? "" : undefined}>
          <section className="kn-side" aria-label="Documents" inert={expanded}>
            <div className="kn-side-head">
              <span>Documents</span>
              <span className="kn-side-count">{items.length}</span>
            </div>
            {items.some((i) => !i.ingested) && (
              <p className="kn-ingest-summary">
                <span className="kn-status">{items.filter((i) => !i.ingested).length} not ingested</span>
              </p>
            )}
            <DocList items={items} links={links} focusId={focusDoc} onPick={pick} onRemove={onRemove} />
          </section>
          <section className="kn-graph" aria-label="Knowledge graph">
            <div className="kn-graph-top">
              <p className="kn-graph-stats">
                <strong>{items.length}</strong> documents · <strong>{refCount}</strong> references and topics · <strong>{graph.links.length}</strong> links
              </p>
              <GraphLegend counts={counts} types={types} onToggle={toggle} sharedOnly={sharedOnly} onShared={setSharedOnly} />
            </div>
            <KnowledgeGraph
              graph={graph}
              focusId={focusNode ? focusNode.id : null}
              onFocus={onFocus}
              expanded={expanded}
              onExpand={setExpanded}
              label={`Knowledge graph: ${items.length} documents linked to ${refCount} references and topics. The list beside it names every document.`}
            />
            {focusNode ? (
              <GraphDetails
                graph={graph}
                node={focusNode}
                onFocus={onFocus}
                passages={passages}
                initialPart={initialPart}
                highlightAnswer={highlightAnswer}
              />
            ) : (
              <p className="kn-graph-hint">Click a node to explore it · drag to move · scroll to zoom · double-click to fit</p>
            )}
          </section>
        </div>
      )}

      <UploadDialog open={uploading} onClose={() => setUploading(false)} onAdded={onAdded} />
    </div>
  );
}
