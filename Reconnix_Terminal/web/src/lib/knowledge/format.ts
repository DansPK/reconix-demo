/* How the Security knowledge page words a file (pure): its type, its source, its size and when it
   was added, plus the search over names. */
import type { KnowledgeItem, KnowledgeKind, KnowledgeOrigin } from "./types";

export const KIND_LABEL: Record<KnowledgeKind, string> = {
  pdf: "PDF",
  docx: "DOCX",
  txt: "TXT",
  md: "MD",
  json: "JSON",
  yaml: "YAML",
};

export const ORIGIN_LABEL: Record<KnowledgeOrigin, string> = {
  web: "Web upload",
  terminal: "Terminal (/add-on)",
};

const UNITS = ["B", "KB", "MB", "GB"];

/** "512 B", "3.4 KB", "1.2 MB", "340 KB" (1 KB = 1,024 bytes, as the 10 MB cap counts). */
export function humanSize(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} B`;
  const shown = value < 10 ? value.toFixed(1).replace(/\.0$/, "") : String(Math.round(value));
  return `${shown} ${UNITS[unit]}`;
}

/** "PDF · 1.2 MB". */
export const typeAndSize = (item: Pick<KnowledgeItem, "kind" | "bytes">) => `${KIND_LABEL[item.kind]} · ${humanSize(item.bytes)}`;

/** "Web upload · PDF · 1.2 MB". */
export const sourceLine = (item: Pick<KnowledgeItem, "source" | "kind" | "bytes">) => `${ORIGIN_LABEL[item.source]} · ${typeAndSize(item)}`;

/** The local date and time a file was added ("22 Oct 2026, 09:30"), or the raw value when it
    can't be read. Browser only: it follows the reader's locale and time zone. */
export function addedAtLabel(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** The files whose name holds `query` (case and surrounding spaces ignored), in their order. */
export function matchName(items: KnowledgeItem[], query: string): KnowledgeItem[] {
  const q = query.trim().toLowerCase();
  return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
}

/** How Open shows a file: in a new tab (PDF and text), or as a download (DOCX). */
export const opensInline = (kind: KnowledgeKind) => kind !== "docx";
