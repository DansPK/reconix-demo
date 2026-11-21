/* The Security knowledge page on the Core API (server only): the knowledge add-ons the AI
   Assistant's agent searches (GET/POST/DELETE /knowledge-add-ons), and what each one talks
   about (GET /knowledge-add-ons/{id}/references) for the graph, its masked passages (as the API
   masked them), the built-in knowledge about a reference, and the re-ingest job. */
import "server-only";

import type { KnowledgeItem } from "../knowledge/types";
import { CoreError, coreJson } from "./core";
import { knowledgeText } from "../assistant/knowledge";
import { readKnowledge } from "../assistant/knowledge/read";
import { listKnowledge } from "../knowledge/list";
import { asMain } from "./sessions";

/** GET /knowledge-add-ons row (KnowledgeAddOnOut). */
type CoreAddOn = { knowledge_add_on_id: string; name: string; kind: string; size_bytes: number; chunk_count: number; interface: string; created_at: string; ingest_status?: string };

/** One reference or topic (KnowledgeReferenceOut). */
export type KnowledgeRef = { type: "CVE" | "CWE" | "OWASP" | "ATTACK" | "TOOL" | "TOPIC"; ref_id: string; label: string; count: number };

/** The page's graph: every document and what it talks about. */
export type KnowledgeGraphData = { items: KnowledgeItem[]; references: Record<string, KnowledgeRef[]> };

export const MAX_ADD_ONS = 50; // the API's limit

const KINDS = new Set(["txt", "md", "json", "yaml", "docx", "pdf"]);

export function toItem(a: CoreAddOn): KnowledgeItem {
  const kind = a.kind.toLowerCase();
  return {
    id: a.knowledge_add_on_id,
    name: a.name,
    kind: (KINDS.has(kind) ? kind : "txt") as KnowledgeItem["kind"],
    bytes: a.size_bytes,
    chunks: a.chunk_count,
    addedAt: a.created_at,
    source: a.interface === "web" ? "web" : "terminal",
    original: false, // the API keeps no original
    ingested: a.ingest_status !== "PENDING",
  };
}

/** Every document, newest first. */
export async function listItems(): Promise<KnowledgeItem[]> {
  if (!process.env.RECONIX_CORE_API?.trim()) return (await listKnowledge()).items;
  const rows = await asMain((token) => coreJson<CoreAddOn[]>("/knowledge-add-ons", { token }));
  return rows.map(toItem).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

/** Adds one file: the API reads, masks and splits it now, and it waits (not ingested) until
    Ingest puts it into the knowledge search. */
export async function addItem(name: string, bytes: Uint8Array): Promise<KnowledgeItem> {
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart]), name);
  form.append("interface", "web");
  form.append("name", name);
  form.append("ingest_now", "false");
  return toItem(await asMain((token) => coreJson<CoreAddOn>("/knowledge-add-ons", { method: "POST", form, token })));
}

export const removeItem = (id: string) => asMain((token) => coreJson(`/knowledge-add-ons/${id}`, { method: "DELETE", token }));

/** Every document with its references and topics (one call per document, at once). */
export async function graphData(): Promise<KnowledgeGraphData> {
  const items = await listItems();
  if (!process.env.RECONIX_CORE_API?.trim()) return { items, references: {} };
  const pairs = await Promise.all(
    items.map(async (item) => {
      const out = await asMain((token) => coreJson<{ references: KnowledgeRef[] }>(`/knowledge-add-ons/${item.id}/references`, { token })).catch((error: unknown) => {
        // removed between the list and this call: no links; anything else (Qdrant down) fails loudly
        if (error instanceof CoreError && error.status === 404) return { references: [] };
        throw error;
      });
      return [item.id, out.references] as const;
    }),
  );
  return { items, references: Object.fromEntries(pairs) };
}

/** One passage of a document, with where its references and topics are named. */
export type KnowledgePassage = { index: number; text: string; spans: { type: KnowledgeRef["type"]; ref_id: string; start: number; end: number }[] };
export type KnowledgePassages = { total: number; offset: number; passages: KnowledgePassage[] };

/** A page of a document's passages (masked by the API). */
export async function passagesOf(id: string, offset: number, limit: number): Promise<KnowledgePassages> {
  if (!process.env.RECONIX_CORE_API?.trim()) {
    const source = (await readKnowledge()).sources.find(item => item.id === id);
    if (!source) throw new CoreError(404, "NOT_FOUND", "This document is unavailable.");
    return { total: source.chunks.length, offset, passages: source.chunks.slice(offset, offset + limit).map((text, i) => ({ index: offset + i, text: knowledgeText(text), spans: [] })) };
  }
  const out = await asMain((token) =>
    coreJson<KnowledgePassages & { knowledge_add_on_id: string }>(`/knowledge-add-ons/${id}/passages?offset=${offset}&limit=${limit}`, { token }),
  );
  return { total: out.total, offset: out.offset, passages: out.passages };
}

/** What a reference is, from the API's built-in knowledge base (CVE, CWE, OWASP, ATT&CK, tool
    guides). null: the knowledge base says nothing about it. */
export type KnowledgeAbout = { title: string; text: string; url: string; source: string } | null;

type Hit = { source: string; ref_id: string; title: string; text: string; url: string; score: number };

const SOURCES: Record<KnowledgeRef["type"], (refId: string) => string[]> = {
  CVE: () => ["CVE"],
  CWE: () => ["CWE"],
  OWASP: (id) => [id.startsWith("API") ? "OWASP_API_TOP10" : "OWASP_TOP10"],
  ATTACK: () => ["ATTACK"],
  TOOL: () => ["TOOL_GUIDE"],
  TOPIC: () => ["OWASP_TOP10", "CWE", "ATTACK", "OWASP_API_TOP10"],
};
const MAX_ABOUT = 900;

export async function aboutRef(type: KnowledgeRef["type"], refId: string, label: string): Promise<KnowledgeAbout> {
  const params = new URLSearchParams({ q: (type === "TOPIC" ? label : refId).slice(0, 200), limit: "5" });
  for (const s of SOURCES[type](refId)) params.append("source", s);
  const hits = await asMain((token) => coreJson<Hit[]>(`/knowledge/search?${params}`, { token }));
  const want = refId.toLowerCase();
  const hit = type === "TOPIC" ? hits[0] : hits.find((h) => h.ref_id.toLowerCase() === want || h.title.toLowerCase().includes(want));
  if (!hit) return null;
  const text = hit.text.length > MAX_ABOUT ? `${hit.text.slice(0, MAX_ABOUT - 1).trimEnd()}…` : hit.text;
  return { title: hit.title, text, url: /^https:\/\//.test(hit.url) ? hit.url : "", source: hit.source };
}

/** The knowledge re-ingest job (KnowledgeReingestOut). */
export type ReingestJob = {
  status: "IDLE" | "RUNNING" | "COMPLETED" | "FAILED";
  scope: "NEW" | "ALL";
  new_ingested: number;
  step: "PUBLIC" | "ADD_ONS" | null;
  public_pieces: number;
  add_ons_done: number;
  add_ons_total: number;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
};

export const reingestStatus = () => asMain((token) => coreJson<ReingestJob>("/knowledge/reingest", { token }));
export const startReingest = (scope: "NEW" | "ALL") => asMain((token) => coreJson<ReingestJob>(`/knowledge/reingest?scope=${scope}`, { method: "POST", token }));
