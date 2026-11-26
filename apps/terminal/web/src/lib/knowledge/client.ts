/* The page's side of the Security knowledge routes (browser only): list the files, upload one
   (XMLHttpRequest, for its upload progress) and remove one. Every answer is checked before the
   page uses it, and every refusal becomes one sentence for the page. */
import { z } from "zod";

import { knowledgeAboutRoute, KNOWLEDGE_GRAPH_ROUTE, KNOWLEDGE_REINGEST_ROUTE, knowledgeFileRoute, knowledgePassagesRoute, KNOWLEDGE_ROUTE } from "./paths";
import type { KnowledgeItem, KnowledgeListing } from "./types";

const ItemSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  name: z.string().min(1).max(400),
  kind: z.enum(["txt", "md", "json", "yaml", "docx", "pdf"]),
  bytes: z.number().int().min(0),
  chunks: z.number().int().min(0),
  addedAt: z.string().max(40),
  source: z.enum(["web", "terminal"]),
  original: z.boolean(),
  ingested: z.boolean(),
});
const ListingSchema = z.object({ state: z.enum(["missing", "refused", "ok"]), items: z.array(ItemSchema).max(500), max: z.number().int().min(1) });
const AddedSchema = z.object({ source: ItemSchema });

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; detail: string };

const FALLBACK: Record<number, string> = {
  401: "Your session ended. Open the dashboard again with the sign-in link /web prints.",
  403: "The dashboard refused that request. Reload the page and try again.",
  404: "That knowledge file is not saved any more.",
  413: "The file is over 10 MB.",
  429: "Too many uploads at once. Wait a moment and try again.",
};

/** The route's `detail`, or a sentence for its status. */
function detailOf(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string" && detail && detail.length <= 400) return detail;
  return FALLBACK[status] ?? `The dashboard could not do that (HTTP ${status}).`;
}

const OFFLINE = "The dashboard could not be reached. Is it still running?";
const UNEXPECTED = "The dashboard answered in a way this page doesn't understand. Reload it.";

async function call<T>(url: string, init: RequestInit, schema: z.ZodType<T>): Promise<Result<T>> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    return { ok: false, status: 0, detail: OFFLINE };
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, status: response.status, detail: detailOf(response.status, body) };
  const parsed = schema.safeParse(body);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, status: response.status, detail: UNEXPECTED };
}

export const listKnowledge = (): Promise<Result<KnowledgeListing>> => call(KNOWLEDGE_ROUTE, { method: "GET" }, ListingSchema);

const RefSchema = z.object({
  type: z.enum(["CVE", "CWE", "OWASP", "ATTACK", "TOOL", "TOPIC"]),
  ref_id: z.string().max(200),
  label: z.string().max(200),
  count: z.number().int().min(0),
});
const GraphSchema = z.object({ items: z.array(ItemSchema).max(500), references: z.record(z.string(), z.array(RefSchema).max(200)) });
export type KnowledgeGraphAnswer = z.infer<typeof GraphSchema>;

/** Every document and what it talks about (names and counts only). */
export const loadKnowledgeGraph = (): Promise<Result<KnowledgeGraphAnswer>> => call(KNOWLEDGE_GRAPH_ROUTE, { method: "GET" }, GraphSchema);

export const removeKnowledge = (id: string): Promise<Result<unknown>> => call(knowledgeFileRoute(id), { method: "DELETE" }, z.object({ ok: z.literal(true) }));

/** Uploads `file` (the field `file` of a multipart body). `onProgress` gets the share sent so far
    (0…1); once it reaches 1 the server is reading the file. */
export function uploadKnowledge(file: File, onProgress: (sent: number) => void): Promise<Result<KnowledgeItem>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", KNOWLEDGE_ROUTE);
    xhr.responseType = "text";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.upload.onload = () => onProgress(1);
    xhr.onerror = () => resolve({ ok: false, status: 0, detail: OFFLINE });
    xhr.onabort = () => resolve({ ok: false, status: 0, detail: OFFLINE });
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status < 200 || xhr.status >= 300) return resolve({ ok: false, status: xhr.status, detail: detailOf(xhr.status, body) });
      const parsed = AddedSchema.safeParse(body);
      resolve(parsed.success ? { ok: true, value: parsed.data.source } : { ok: false, status: xhr.status, detail: UNEXPECTED });
    };
    const form = new FormData();
    form.append("file", file, file.name);
    xhr.send(form);
  });
}

const SpanSchema = z.object({ type: RefSchema.shape.type, ref_id: z.string().max(200), start: z.number().int().min(0), end: z.number().int().min(0) });
const PassagesSchema = z.object({
  total: z.number().int().min(0),
  offset: z.number().int().min(0),
  passages: z.array(z.object({ index: z.number().int().min(0), text: z.string().max(20_000), spans: z.array(SpanSchema).max(2_000) })).max(100),
});
export type PassagePage = z.infer<typeof PassagesSchema>;
export type Passage = PassagePage["passages"][number];

/** A page of a document's passages (masked), with where each reference is named. */
export const loadPassages = (id: string, offset: number, limit = 50): Promise<Result<PassagePage>> => call(knowledgePassagesRoute(id, offset, limit), { method: "GET" }, PassagesSchema);

const AboutSchema = z.object({
  about: z.object({ title: z.string().max(400), text: z.string().max(2_000), url: z.string().max(1_000), source: z.string().max(40) }).nullable(),
});
export type About = z.infer<typeof AboutSchema>["about"];

/** What a reference is, from the built-in knowledge base (null: nothing there). */
export const loadAbout = (type: string, ref: string, label: string): Promise<Result<About>> =>
  call(knowledgeAboutRoute(type, ref, label), { method: "GET" }, AboutSchema).then((r) => (r.ok ? { ok: true, value: r.value.about } : r));

const ReingestSchema = z.object({
  status: z.enum(["IDLE", "RUNNING", "COMPLETED", "FAILED"]),
  scope: z.enum(["NEW", "ALL"]),
  new_ingested: z.number().int().min(0),
  step: z.enum(["PUBLIC", "ADD_ONS"]).nullable(),
  public_pieces: z.number().int().min(0),
  add_ons_done: z.number().int().min(0),
  add_ons_total: z.number().int().min(0),
  started_at: z.string().max(40).nullable(),
  finished_at: z.string().max(40).nullable(),
  error_code: z.string().max(80).nullable(),
  error_message: z.string().max(400).nullable(),
});
export type Reingest = z.infer<typeof ReingestSchema>;

/** The re-ingest job, and starting it (409 while one runs). */
export const loadReingest = (): Promise<Result<Reingest>> => call(KNOWLEDGE_REINGEST_ROUTE, { method: "GET" }, ReingestSchema);
export const startReingest = (scope: "NEW" | "ALL"): Promise<Result<Reingest>> => call(`${KNOWLEDGE_REINGEST_ROUTE}?scope=${scope}`, { method: "POST" }, ReingestSchema);
