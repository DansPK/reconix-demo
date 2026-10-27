/* What the Security knowledge routes answer (plain data, safe for the browser). A file is named by
   its id and its display name; no path ever leaves the server. */
import type { KnowledgeOrigin } from "@/lib/assistant/knowledge/schema";

export type { KnowledgeOrigin };
export type KnowledgeKind = "txt" | "md" | "json" | "yaml" | "docx" | "pdf";

/** One knowledge file as the page lists it. */
export interface KnowledgeItem {
  id: string; // 32 hex digits
  name: string; // the display name, cleaned and masked
  kind: KnowledgeKind;
  bytes: number; // the original's size
  chunks: number; // passages the AI can quote
  addedAt: string; // ISO-8601, UTC
  source: KnowledgeOrigin; // the web page or the terminal's /add-on
  original: boolean; // its original is kept (encrypted), so Open can show it
}

/** GET /api/knowledge. `state`: the folder is missing (nothing added yet), refused (it failed a
    safety check: nothing is listed) or read. `max`: how many files the folder may hold. */
export interface KnowledgeListing {
  state: "missing" | "refused" | "ok";
  items: KnowledgeItem[];
  max: number;
}
