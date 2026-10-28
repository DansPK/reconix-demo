/* The page's side of the Security knowledge route (browser only): list the files, read-only.
   Static demo: no upload or remove (those went through the TUI's Python /add-on code). Every
   answer is checked before the page uses it, and every refusal becomes one sentence. */
import { z } from "zod";

import { KNOWLEDGE_ROUTE } from "./paths";
import type { KnowledgeListing } from "./types";

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

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; detail: string };

const FALLBACK: Record<number, string> = {
  404: "That knowledge file is not saved any more.",
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
