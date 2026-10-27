/* The shared ranking vectors (tests/knowledge-vectors.json, written from the Python side, the
   TUI's /add-on ranker) checked against this ranker (lib/assistant/knowledge/rank.ts), so both
   tokenize and rank alike: the tokens of each input, and for each query the relevant passages in
   order (at least two of the query's distinct tokens, or all when it has fewer; the best 4,
   ties by source name then index) with their scores to 4
   decimals; and, in the "budget" section, the texts withinBudget keeps of plain passages (cut on
   code points, " \t\n\r" trimmed, then "…"). The file arrives with the TUI's branch; until then
   this says so and skips, and so does the budget part while the file has no such section. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildCorpus, rank, tokenize, withinBudget } from "@/lib/assistant/knowledge/rank";

interface Vectors {
  tokens: { input: string; expected: string[] }[];
  corpus: { name: string; chunks: string[] }[]; // a source: its file name, as in index.json
  queries: { query: string; expected: { source: string; index: number; score: number }[] }[];
  budget?: { budget: number; passages: string[]; expected: string[] }[]; // the texts kept, in order
}

const FILE = path.join(__dirname, "knowledge-vectors.json");
const vectors: Vectors | null = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as Vectors) : null;
const HALF = 0.5e-4 + 1e-9; // the expected scores are rounded to 4 decimals

if (!vectors) {
  it.skip("tests/knowledge-vectors.json is absent (the TUI's /add-on branch writes it): nothing to check yet", () => {});
} else {
  describe("the shared knowledge vectors", () => {
    it("has cases to check", () => {
      expect(vectors.tokens.length + vectors.queries.length).toBeGreaterThan(0);
    });

    it.each(vectors.tokens.map((t) => [JSON.stringify(t.input).slice(0, 60), t] as const))("tokenizes %s", (_, t) => {
      expect(tokenize(t.input)).toEqual(t.expected);
    });

    const corpus = buildCorpus(vectors.corpus);
    it.each(vectors.queries.map((q) => [JSON.stringify(q.query).slice(0, 60), q] as const))("ranks %s", (_, q) => {
      const got = rank(corpus, q.query);
      expect(got.map((p) => [p.source, p.index])).toEqual(q.expected.map((e) => [e.source, e.index]));
      got.forEach((p, i) => expect(Math.abs(p.score - q.expected[i].score), `${p.source} #${p.index}`).toBeLessThanOrEqual(HALF));
    });

    const budget = vectors.budget;
    if (!budget) {
      it.skip('the vectors have no "budget" section yet (the TUI\'s /add-on branch adds it): the cut is not checked against Python', () => {});
    } else {
      it("has budget cases to check", () => {
        expect(budget.length).toBeGreaterThan(0);
      });
      const label = (c: { budget: number; passages: string[] }) => `${c.budget} over ${c.passages.map((t) => [...t].length).join(", ")} code points`;
      it.each(budget.map((c) => [label(c), c] as const))("fits the budget %s", (_, c) => {
        const kept = withinBudget(c.passages.map((text, index) => ({ source: "v", index, text })), c.budget);
        expect(kept.map((p) => p.text)).toEqual(c.expected);
      });
    }
  });
}
