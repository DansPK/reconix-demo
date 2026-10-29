/* The knowledge the TUI's /add-on added, searched for one question (server only, read-only):
   the folder read (read.ts), ranked (rank.ts), and the passages made safe for the prompt. The TUI
   redacts the text when it adds a file; here each passage and name is masked again (redact.ts)
   and cleaned like every other value in the prompt (context.ts `clean()`: one line, no control
   or invisible characters, `<`/`>` → `‹`/`›`), then cut to the budget. The model gets source
   names, never paths. Anything that goes wrong is no knowledge: the answer never fails for it. */
import "server-only";

import { clean } from "../context";
import { redact } from "../redact";
import { knowledgeDir } from "./paths";
import { buildCorpus, type Corpus, queryTokens, rank, type Scored, withinBudget } from "./rank";
import { readKnowledge } from "./read";
import { MAX_CHUNK, MAX_NAME } from "./schema";

export type KnowledgePassage = Scored;

export interface KnowledgeResult {
  passages: KnowledgePassage[]; // best first, cleaned and masked, within the budget
  sources: string[]; // the names of their sources, each once, in that order
}

export const NO_KNOWLEDGE: KnowledgeResult = { passages: [], sources: [] };

/** A source's name as the model and the page see it. */
export const knowledgeName = (name: string) => clean(redact(name), MAX_NAME);
/** A passage as the model sees it (then cut to the budget). */
export const knowledgeText = (text: string) => clean(redact(text), MAX_CHUNK);

// the corpus of the files last read, rebuilt only when one of them changes
const CORPUS = Symbol.for("reconix.assistant.knowledge.corpus");
type Shared = { [CORPUS]?: { key: string; corpus: Corpus } };
const shared = globalThis as Shared;

function corpusOf(key: string, sources: { name: string; chunks: string[] }[]): Corpus {
  const known = shared[CORPUS];
  if (known && known.key === key) return known.corpus;
  const corpus = buildCorpus(sources);
  shared[CORPUS] = { key, corpus };
  return corpus;
}

/** The passages relevant to `question` (already masked: the question as it is kept), from the
    folder `dir`. */
export async function searchKnowledge(question: string, dir: string = knowledgeDir()): Promise<KnowledgeResult> {
  try {
    if (!queryTokens(question).length) return NO_KNOWLEDGE; // nothing to look for: the disk isn't read
    const read = await readKnowledge(dir);
    if (!read.sources.length) return NO_KNOWLEDGE;
    const ranked = rank(corpusOf(`${dir}\n${read.signature}`, read.sources), question);
    const passages = withinBudget(
      ranked.map((p) => ({ ...p, source: knowledgeName(p.source), text: knowledgeText(p.text) })).filter((p) => p.source && p.text),
    );
    return { passages, sources: [...new Set(passages.map((p) => p.source))] };
  } catch {
    return NO_KNOWLEDGE;
  }
}
