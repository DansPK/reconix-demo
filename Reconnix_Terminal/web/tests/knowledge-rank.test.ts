/* The knowledge ranker (lib/assistant/knowledge/rank.ts) on cases worked out by hand: the
   tokenizer, BM25 (k1 1.2, b 0.75, idf ln(1 + (N − df + 0.5)/(df + 0.5))), the matched-tokens rule, the
   best 4, ties by source name then passage index, and the 4,000-character budget. The shared
   vectors from the Python side are checked in knowledge-vectors.test.ts. */
import { describe, expect, it } from "vitest";

import { BUDGET, buildCorpus, idf, MIN_MATCHED, queryTokens, rank, scoreAll, STOPWORDS, tokenize, TOP_K, withinBudget } from "@/lib/assistant/knowledge/rank";

const scored = (corpus: ReturnType<typeof buildCorpus>, q: string) => scoreAll(corpus, q).map((p) => [p.source, p.index, p.score] as const);

describe("tokenize", () => {
  it("lower-cases, keeps runs of [a-z0-9] of 2 or more, and drops the stopwords", () => {
    expect(tokenize("The Quick-brown FOX's 2 jumps, over 42 x9 a_b é café")).toEqual(["quick", "brown", "fox", "jumps", "over", "42", "x9", "caf"]);
    expect(tokenize("What is the SQL-injection in /api/v1?")).toEqual(["sql", "injection", "api", "v1"]);
    expect(tokenize("")).toEqual([]);
    expect(tokenize("a an and the of to")).toEqual([]);
  });
  it("keeps repeats; the question's tokens count once each, in their first order", () => {
    expect(tokenize("token token TOKEN")).toEqual(["token", "token", "token"]);
    expect(queryTokens("gamma Alpha gamma ALPHA beta")).toEqual(["gamma", "alpha", "beta"]);
  });
  it("has the plan's 57 stopwords", () => {
    expect(STOPWORDS.size).toBe(57);
    for (const w of ["a", "your", "would", "which", "should", "our"]) expect(STOPWORDS.has(w)).toBe(true);
    expect(STOPWORDS.has("not")).toBe(false);
  });
});

describe("BM25", () => {
  // a.md #0 "alpha beta" (2 tokens), a.md #1 "beta gamma gamma" (3), b.txt #0 "delta" (1):
  // N 3, avgdl 2; df alpha 1, beta 2, gamma 1
  const corpus = buildCorpus([
    { name: "a.md", chunks: ["alpha beta", "beta gamma gamma"] },
    { name: "b.txt", chunks: ["delta"] },
  ]);

  it("has the corpus statistics", () => {
    expect(corpus.passages).toHaveLength(3);
    expect(corpus.avgdl).toBe(2);
    expect(corpus.df.get("beta")).toBe(2);
    expect(idf(3, 1)).toBeCloseTo(Math.log(1 + 2.5 / 1.5), 12); // 0.980829
    expect(idf(3, 2)).toBeCloseTo(Math.log(1.6), 12); // 0.470004
  });
  it("scores one term: gamma twice in a 3-token passage", () => {
    // 0.980829 × (2 × 2.2) / (2 + 1.2 × (0.25 + 0.75 × 3 / 2)) = 0.980829 × 4.4 / 3.65
    const [, gamma] = scored(corpus, "gamma");
    expect(gamma[2]).toBeCloseTo(1.18237, 5);
    expect(scored(corpus, "gamma")[0][2]).toBe(0);
  });
  it("scores a shorter passage higher for the same term", () => {
    const s = scored(corpus, "beta");
    expect(s[0][2]).toBeCloseTo(0.470004, 6); // tf 1, length 2 = avgdl: idf × 2.2 / 2.2
    expect(s[1][2]).toBeCloseTo(0.390192, 6); // tf 1, length 3
  });
  it("sums the terms and counts a repeated question word once", () => {
    const s = scored(corpus, "gamma gamma alpha");
    expect(s[0][2]).toBeCloseTo(0.980829, 6);
    expect(s[1][2]).toBeCloseTo(1.18237, 5);
    expect(scored(corpus, "alpha gamma")).toEqual(s);
  });
  it("gives nothing for a question of stopwords, or an empty corpus", () => {
    expect(rank(corpus, "what is the")).toEqual([]);
    expect(rank(buildCorpus([]), "gamma")).toEqual([]);
    expect(rank(buildCorpus([{ name: "x.md", chunks: ["", "the a"] }]), "gamma")).toEqual([]);
  });
});

describe("selection", () => {
  // ten passages, 21 tokens (avgdl 2.1): "rare" in one, "common" in three
  const corpus = buildCorpus([
    { name: "notes.md", chunks: ["rare word here", "common one", "common two", "common three", ...Array.from({ length: 6 }, (_, i) => `filler${i} text`)] },
  ]);

  it("keeps a passage that holds one token of a one-token question, however low its score", () => {
    // ln(1 + 9.5 / 1.5) × 2.2 / (1 + 1.2 × (0.25 + 0.75 × 3 / 2.1)) = 1.695217
    expect(rank(corpus, "rare")).toEqual([{ source: "notes.md", index: 0, text: "rare word here", score: expect.closeTo(1.695217, 6), matched: 1 }]);
    // ln(1 + 7.5 / 3.5) × 2.2 / (1 + 1.2 × (0.25 + 0.75 × 2 / 2.1)) = 1.167883: still relevant
    expect(scoreAll(corpus, "common")[1].score).toBeCloseTo(1.167883, 6);
    expect(rank(corpus, "common").map((p) => p.index)).toEqual([1, 2, 3]);
  });

  it(`needs ${MIN_MATCHED} of the question's distinct tokens in one passage`, () => {
    expect(rank(corpus, "rare common")).toEqual([]); // each passage holds only one of them
    expect(rank(corpus, "rare word")).toEqual([expect.objectContaining({ index: 0, matched: 2 })]);
    expect(rank(corpus, "rare rare rare")).toHaveLength(1); // one distinct token: one is enough
  });

  it("uses a one-passage source, which a fixed score threshold would leave out", () => {
    const small = buildCorpus([{ name: "keys.md", chunks: ["Rotate the signing keys every 30 days."] }]);
    // N = 1: idf = ln(1 + 0.5 / 1.5) = 0.287682, far below any fixed threshold
    expect(rank(small, "how often do we rotate signing keys")).toEqual([expect.objectContaining({ source: "keys.md", index: 0, matched: 3 })]);
  });

  it(`keeps the best ${TOP_K}, ties by source name, then passage index`, () => {
    const same = "zephyrine quokka rotation";
    const filler = Array.from({ length: 30 }, (_, i) => `unrelated passage number${i}`);
    const tied = buildCorpus([
      { name: "b.md", chunks: [same, same] },
      { name: "a.md", chunks: [...filler, same] },
      { name: "c.md", chunks: [same, "quokka rotation rotation"] },
    ]);
    const top = rank(tied, "quokka rotation");
    expect(top).toHaveLength(TOP_K);
    // c.md #1 says "rotation" twice (4.462081); then four equal ones (3.757542) by name, then
    // index: c.md #0 is the fifth
    expect(top.map((p) => [p.source, p.index])).toEqual([
      ["c.md", 1],
      ["a.md", 30],
      ["b.md", 0],
      ["b.md", 1],
    ]);
    expect(top[0].score).toBeCloseTo(4.462081, 6);
    expect(top[1].score).toBeCloseTo(3.757542, 6);
    expect(top[1].score).toBe(top[3].score);
    expect(top.every((p) => p.matched >= MIN_MATCHED)).toBe(true);
  });

  it("compares names by code point, as Python does", () => {
    const same = "zephyrine quokka rotation";
    const filler = Array.from({ length: 20 }, (_, i) => `unrelated passage number${i}`);
    const tied = buildCorpus([
      { name: "\u{1F600}.md", chunks: [same] },
      { name: "\uFF41.md", chunks: [same] }, // a full-width "a": below the emoji by code point, above it by UTF-16 unit
      { name: "z.md", chunks: [...filler] },
    ]);
    expect(rank(tied, "quokka").map((p) => p.source)).toEqual(["\uFF41.md", "\u{1F600}.md"]);
  });
});

describe("withinBudget", () => {
  const p = (index: number, length: number) => ({ source: "a.md", index, text: "x".repeat(length), score: 2 });

  it(`sends at most ${BUDGET} characters, cutting the passage that doesn't fit`, () => {
    const kept = withinBudget([p(0, 1200), p(1, 1200), p(2, 1200), p(3, 1200)]);
    expect(kept.map((k) => k.index)).toEqual([0, 1, 2, 3]);
    expect(kept.slice(0, 3).every((k) => k.text.length === 1200)).toBe(true);
    expect(kept[3].text).toMatch(/…$/);
    expect(kept.reduce((n, k) => n + k.text.length, 0)).toBe(BUDGET);
  });
  it("leaves out a piece too small to help, and everything after it", () => {
    const kept = withinBudget([p(0, 1000), p(1, 2900), p(2, 1000), p(3, 50)]);
    expect(kept.map((k) => k.index)).toEqual([0, 1]);
    expect(withinBudget([p(0, 3950), p(1, 1000), p(2, 10)]).map((k) => k.index)).toEqual([0]);
  });

  // Python counts and slices code points: an emoji is one character there, two UTF-16 units here
  const text = (index: number, body: string) => ({ source: "a.md", index, text: body, score: 2 });
  const points = (s: string) => [...s].length;

  it("counts the budget in code points, as Python does", () => {
    const emoji = "\u{1F600}".repeat(1000); // 1,000 code points, 2,000 UTF-16 units
    const kept = withinBudget([text(0, emoji), text(1, emoji), text(2, emoji), text(3, emoji)]);
    expect(kept.map((k) => k.text)).toEqual([emoji, emoji, emoji, emoji]);
    expect(kept.reduce((n, k) => n + points(k.text), 0)).toBe(BUDGET);
  });
  it("cuts on code points, so a surrogate pair is never split", () => {
    const kept = withinBudget([text(0, "x".repeat(3700)), text(1, "\u{1F600}".repeat(1000))]);
    expect(kept[1].text).toBe(`${"\u{1F600}".repeat(299)}…`); // left - 1 = 299 code points
    expect(kept[1].text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // no lone high surrogate
    expect(kept.reduce((n, k) => n + points(k.text), 0)).toBe(BUDGET);
  });
  it("keeps MIN_PIECE in code points: 199 left is too few, 200 is enough", () => {
    const emoji = "\u{1F600}".repeat(500);
    expect(withinBudget([text(0, "x".repeat(3801)), text(1, emoji)]).map((k) => k.index)).toEqual([0]);
    const kept = withinBudget([text(0, "x".repeat(3800)), text(1, emoji)]);
    expect(kept.map((k) => k.index)).toEqual([0, 1]);
    expect(points(kept[1].text)).toBe(200);
  });
  it('trims only " \\t\\n\\r" before the "…", like rstrip(" \\t\\n\\r")', () => {
    const cut = (body: string) => withinBudget([text(0, "x".repeat(3700)), text(1, body)])[1].text;
    expect(cut(`${"y".repeat(290)} \t\n\r     ${"z".repeat(100)}`)).toBe(`${"y".repeat(290)}…`); // 290 + 9 = 299
    // trimEnd() would also drop these; Python keeps them
    for (const kept of [" ", "\f", "\v", " ", "　"]) {
      expect(cut(`${"y".repeat(298)}${kept}${"z".repeat(100)}`)).toBe(`${"y".repeat(298)}${kept}…`);
    }
  });
});
