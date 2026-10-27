/* Where the TUI's /add-on keeps the knowledge files the AI Assistant reads (server only):
   RECONIX_KNOWLEDGE_DIR (a leading ~/ is the home folder), or ~/.reconix/knowledge. The TUI
   writes the folder; the dashboard only reads it (read.ts). */
import "server-only";

import { homedir } from "node:os";
import path from "node:path";

/** The knowledge folder the TUI writes (docs/KNOWLEDGE_OPENAPI_FINDINGS_PLAN.md §4). */
export function knowledgeDir(env: Record<string, string | undefined> = process.env): string {
  const configured = env.RECONIX_KNOWLEDGE_DIR?.trim();
  if (!configured) return path.join(homedir(), ".reconix", "knowledge");
  const expanded = configured.startsWith("~/") ? path.join(homedir(), configured.slice(2)) : configured;
  return path.resolve(expanded);
}
