/* The response headers of GET /api/knowledge/<id>/original (pure). PDF and the text kinds open
   in the browser (inline) under a sandbox policy with nothing allowed, so even a file that holds
   markup can't run or fetch anything; a Word file is a download, under a policy that allows
   nothing either (src/proxy.ts leaves the page's own policy off this route). Every response is
   nosniff and never cached, and the file name is given twice (RFC 6266 / RFC 5987): an ASCII
   fallback and the UTF-8 name, both stripped of anything that could end the header value. */
import type { KnowledgeKind } from "./types";

export const CONTENT_TYPE: Record<KnowledgeKind, string> = {
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  json: "application/json",
  yaml: "text/plain; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const EXTENSIONS: Record<KnowledgeKind, string[]> = {
  pdf: [".pdf"],
  txt: [".txt"],
  md: [".md"],
  json: [".json"],
  yaml: [".yaml", ".yml"],
  docx: [".docx"],
};

/** The sandbox for what opens in the browser: no scripts, forms, plugins or fetches, and never
    in a frame. */
export const INLINE_CSP = "sandbox; default-src 'none'; frame-ancestors 'none'";
/** A download: nothing to render, nothing allowed. */
export const DOWNLOAD_CSP = "default-src 'none'; frame-ancestors 'none'";

export const isInline = (kind: KnowledgeKind) => kind !== "docx";

/** The name to save or show the file as: no control, invisible or quoting characters, no path,
    and ending in its kind's extension. */
export function downloadName(name: string, kind: KnowledgeKind): string {
  const safe = (name.split(/[\\/]/).pop() ?? "")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}"*:<>?|;]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const exts = EXTENSIONS[kind];
  const named = safe && !exts.includes(safe.toLowerCase()) ? safe : `knowledge${exts[0]}`;
  return exts.some((e) => named.toLowerCase().endsWith(e)) ? named : `${named}${exts[0]}`;
}

/** RFC 5987's value-chars: everything else percent-encoded (encodeURIComponent leaves ' ( ) *). */
const rfc5987 = (s: string) => encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** `inline|attachment; filename="<ascii>"; filename*=UTF-8''<utf-8>`. */
export function contentDisposition(kind: KnowledgeKind, name: string): string {
  const file = downloadName(name, kind);
  const stripped = file.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/[\\%]/g, "_").trim();
  const ascii = /^[^.]/.test(stripped) ? stripped : `knowledge${stripped.startsWith(".") ? stripped : EXTENSIONS[kind][0]}`;
  return `${isInline(kind) ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${rfc5987(file)}`;
}

/** Every header of the original's response. */
export function originalHeaders(kind: KnowledgeKind, name: string, length: number): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": CONTENT_TYPE[kind],
    "Content-Disposition": contentDisposition(kind, name),
    "Content-Length": String(length),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Content-Security-Policy": isInline(kind) ? INLINE_CSP : DOWNLOAD_CSP,
  };
  return headers;
}
