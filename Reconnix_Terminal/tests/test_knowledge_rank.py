"""The knowledge BM25 ranker: the tokenizer, the formula, the threshold and the tie-break."""

import math

from reconix.store.knowledge import rank


def _fillers(n):
    """`n` short, unrelated passages (so the corpus is big enough for real idf)."""
    words = ["alpha beta gamma", "delta epsilon zeta", "eta theta iota", "kappa lambda mu",
             "nu xi omicron", "pi rho sigma", "tau upsilon phi", "chi psi omega"]
    return [("z.md", i, words[i % len(words)]) for i in range(n)]


# --- the tokenizer -------------------------------------------------------------------------
def test_tokenize_lowercases_and_drops_stopwords():
    got = rank.tokenize("The SQL Injection in the Search API!")
    assert got == ["sql", "injection", "search", "api"]


def test_tokenize_keeps_digits_drops_length_one():
    assert rank.tokenize("x y ab 12 999") == ["ab", "12", "999"]


def test_tokenize_all_stopwords_is_empty():
    assert rank.tokenize("a an the of to") == []


def test_tokenizer_keeps_duplicate_terms():
    # The tokenizer does not de-duplicate; the query de-dup happens in rank().
    assert rank.tokenize("sql sql injection") == ["sql", "sql", "injection"]


# --- the formula, threshold and selection --------------------------------------------------
def test_relevant_passage_scores_and_matches_the_manual_formula():
    docs = [("a.md", 0, "sql injection vulnerability found")] + _fillers(7)
    hits = rank.rank(docs, "sql injection vulnerability")
    assert [(h.source, h.index) for h in hits] == [("a.md", 0)]

    n = len(docs)
    df = 1                                             # each query term is in a.md#0 only
    idf = math.log(1 + (n - df + 0.5) / (df + 0.5))
    toks = rank.tokenize("sql injection vulnerability found")
    lengths = [len(rank.tokenize(t)) for _, _, t in docs]
    avgdl = sum(lengths) / n
    dl = len(toks)
    per_term = idf * (1 * (rank.K1 + 1)) / (1 + rank.K1 * (1 - rank.B + rank.B * dl / avgdl))
    assert hits[0].score == per_term * 3               # three query terms, each once


def test_irrelevant_query_returns_nothing():
    docs = [("a.md", 0, "sql injection vulnerability")] + _fillers(7)
    assert rank.rank(docs, "kubernetes helm chart deployment") == []


def test_needs_two_matches_when_query_has_two_or_more_tokens():
    # a.md matches both terms; b.md matches only "sql" (1 of 2) and is excluded.
    docs = [("a.md", 0, "sql injection vulnerability"),
            ("b.md", 0, "sql reference material only here")] + _fillers(6)
    hits = rank.rank(docs, "sql injection")
    assert [(h.source, h.index) for h in hits] == [("a.md", 0)]


def test_single_token_query_needs_one_match():
    docs = [("a.md", 0, "firewall configuration rules")] + _fillers(6)
    hits = rank.rank(docs, "firewall")
    assert [(h.source, h.index) for h in hits] == [("a.md", 0)]


def test_query_tokens_are_deduplicated():
    docs = [("a.md", 0, "sql injection vulnerability")] + _fillers(7)
    once = rank.rank(docs, "sql")
    thrice = rank.rank(docs, "sql sql sql")
    assert once and thrice
    assert round(once[0].score, 12) == round(thrice[0].score, 12)


def test_top_k_caps_results():
    docs = [("a.md", i, "sql injection vulnerability") for i in range(6)] + _fillers(10)
    hits = rank.rank(docs, "sql injection vulnerability", top=4)
    assert len(hits) == 4


def test_ties_break_by_source_then_index():
    docs = [("b.md", 0, "sql injection vulnerability"),
            ("a.md", 0, "sql injection vulnerability")] + _fillers(6)
    hits = rank.rank(docs, "sql injection vulnerability")
    assert [(h.source, h.index) for h in hits] == [("a.md", 0), ("b.md", 0)]
    assert round(hits[0].score, 9) == round(hits[1].score, 9)


def test_empty_query_or_corpus_is_empty():
    assert rank.rank([], "sql injection") == []
    assert rank.rank([("a.md", 0, "sql injection")], "") == []


# --- the budget ----------------------------------------------------------------------------
def test_fit_budget_keeps_all_that_fit_whole():
    passages = [rank.Passage("a.md", i, "x" * 100, 9.0 - i) for i in range(3)]
    kept = rank.fit_budget(passages, limit=4000)
    assert len(kept) == 3 and all(len(p.text) == 100 for p in kept)


def test_fit_budget_cuts_the_overflowing_passage_when_enough_remains():
    passages = [rank.Passage("a.md", 0, "A" * 3500, 9.0),   # fits, 500 left
                rank.Passage("a.md", 1, "B" * 800, 8.0),    # overflows, 500 >= 200 → cut
                rank.Passage("a.md", 2, "C" * 100, 7.0)]    # nothing after a cut passage
    kept = rank.fit_budget(passages, limit=4000)
    assert len(kept) == 2
    assert kept[0].text == "A" * 3500
    assert kept[1].text == "B" * 499 + "…"             # text[:500-1].rstrip() + "…"
    assert sum(len(p.text) for p in kept) <= 4000


def test_fit_budget_stops_when_too_little_remains():
    passages = [rank.Passage("a.md", 0, "A" * 3900, 9.0),   # fits, 100 left
                rank.Passage("a.md", 1, "B" * 800, 8.0)]    # 100 < 200 → dropped, stop
    kept = rank.fit_budget(passages, limit=4000)
    assert [p.text for p in kept] == ["A" * 3900]
