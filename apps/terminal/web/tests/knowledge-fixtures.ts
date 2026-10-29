/* A knowledge folder written the way the TUI's /add-on writes it (the contract in
   docs/KNOWLEDGE_OPENAPI_FINDINGS_PLAN.md §4, spelled out here on purpose): a 0700 folder,
   index.json and one `<id>.json` per source, each 0600 and replaced atomically (a temporary file,
   then a rename, so a change gives the file a new inode). For the unit, route and e2e tests;
   plain Node, no path aliases (Playwright imports it too). */
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface KnowledgeFileSpec {
  name: string;
  chunks: string[];
  id?: string; // default: from the name
  kind?: string; // default: from the name's extension
}

/** A source id (32 hex digits) made from a name, so the tests can name a file before writing. */
export const knowledgeId = (name: string) => createHash("md5").update(name).digest("hex");

/** Writes `text` to `full` as the TUI does: a temporary file (0600), then a rename over it. */
export function writeAtomic(full: string, text: string): void {
  const tmp = `${full}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, full);
}

export const indexEntry = (f: KnowledgeFileSpec) => ({
  id: f.id ?? knowledgeId(f.name),
  name: f.name,
  kind: f.kind ?? (path.extname(f.name).slice(1) || "txt"),
  bytes: Buffer.byteLength(f.chunks.join("\n\n")),
  chunks: f.chunks.length,
  added_at: "2026-10-22T09:30:00Z",
});

export const sourceDoc = (f: KnowledgeFileSpec) => ({ format: "reconix.knowledge.source/v1", id: f.id ?? knowledgeId(f.name), name: f.name, chunks: f.chunks });

/** Writes the folder `dir` (made 0700 if missing) with these sources, in this order. */
export function writeKnowledge(dir: string, files: KnowledgeFileSpec[]): string[] {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  for (const f of files) writeAtomic(path.join(dir, `${f.id ?? knowledgeId(f.name)}.json`), JSON.stringify(sourceDoc(f)));
  writeAtomic(path.join(dir, "index.json"), JSON.stringify({ format: "reconix.knowledge/v1", sources: files.map(indexEntry) }));
  return files.map((f) => f.id ?? knowledgeId(f.name));
}
