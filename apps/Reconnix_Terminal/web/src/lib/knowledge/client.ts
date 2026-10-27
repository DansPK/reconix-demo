/* The page's side of the Security knowledge routes (browser only): list the files, upload one
   (XMLHttpRequest, for its upload progress) and remove one. Every answer is checked before the
   page uses it, and every refusal becomes one sentence for the page. */
import { z } from "zod";

import { knowledgeFileRoute, KNOWLEDGE_ROUTE } from "./paths";
import type { KnowledgeItem, KnowledgeListing } from "./types";

const ItemSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{32}$/),
  name: z.string().min(1).max(400),
  kind: z.enum(["txt", "md", "json", "yaml", "docx", "pdf"]),
  bytes: z.number().int().min(0),
  chunks: z.number().int().min(0),
  addedAt: z.string().max(40),
  source: z.enum(["web", "terminal"]),
  original: z.boolean(),
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
