/* The Security knowledge page's list (server only, read-only): the index the TUI's /add-on and
   the knowledge CLI keep, read as the AI Assistant reads it (lib/assistant/knowledge/read.ts),
   each name masked and cleaned again as the model sees it. Ids, names, kinds, sizes and times
   only: never a path. */
import "server-only";

import { knowledgeName } from "../assistant/knowledge";
import { knowledgeDir } from "../assistant/knowledge/paths";
import { readKnowledgeIndex } from "../assistant/knowledge/read";
import { type IndexEntry, MAX_SOURCES } from "../assistant/knowledge/schema";
import type { KnowledgeItem, KnowledgeListing } from "./types";

export const toItem = (e: IndexEntry): KnowledgeItem => ({
  id: e.id,
  name: knowledgeName(e.name) || "untitled",
  kind: e.kind,
  bytes: e.bytes,
  chunks: e.chunks,
  addedAt: e.added_at,
  source: e.source,
  original: e.original,
});

/** Every file, newest first. */
export async function listKnowledge(dir: string = knowledgeDir()): Promise<KnowledgeListing> {
  const read = await readKnowledgeIndex(dir);
  const items = read.entries.map(toItem).reverse(); // the index keeps the order they were added in
  return { state: read.state, items, max: MAX_SOURCES };
}

/** One file by its id, or null. */
export async function findKnowledge(id: string, dir: string = knowledgeDir()): Promise<KnowledgeItem | null> {
  return (await listKnowledge(dir)).items.find((i) => i.id === id) ?? null;
}
