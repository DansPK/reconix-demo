"""BM25 ranking for knowledge passages — the contract shared with the web.

The tokenizer and the BM25 formula here are duplicated in TypeScript on the web side
(`web/src/lib/assistant/knowledge`). `web/tests/knowledge-vectors.json`, generated from this
module by `scripts/make_knowledge_vectors.py`, pins the tokens and the scores to four decimals
so both implementations stay identical. Do not change the parameters or the tie-break without
regenerating the vectors and updating the web port.
"""

import math
import re
from dataclasses import dataclass
from typing import Dict, List, Sequence, Tuple

# --- parameters (the contract) -------------------------------------------------------------
K1 = 1.2
B = 0.75
MIN_MATCHED = 2                # a passage needs this many distinct query tokens (or the whole
#                                query when it is shorter) and a BM25 score above zero
TOP_K = 4                      # how many relevant passages are used
BUDGET_CHARS = 4000            # at most this many characters of passage text go to a model
MIN_PIECE = 200                # a passage is cut to the remainder only if at least this is left
TRIM = " \t\n\r"               # what a cut passage loses from its end before the "…"

# Lowercase, `[a-z0-9]+`, length >= 2, minus these stopwords.
STOPWORDS = frozenset(
    "a an and are as at be but by can could did do does for from had has have how if in into "
    "is it its of on or our should so than that the their them then there these they this to "
    "was we were what when where which who why will with would you your".split()
)

_TOKEN = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> List[str]:
    """Lowercase alphanumeric runs of length >= 2, without the stopwords."""
    return [t for t in _TOKEN.findall((text or "").lower())
            if len(t) >= 2 and t not in STOPWORDS]


@dataclass(frozen=True)
class Passage:
    """One ranked passage: its source file name, its index in that source, text and score."""
    source: str
    index: int
    text: str
    score: float


def rank(docs: Sequence[Tuple[str, int, str]], query: str, *, top: int = TOP_K) -> List[Passage]:
    """BM25 over every passage in `docs`; the relevant top passages.

    `docs` is `(source name, passage index, text)` for every passage of every source (the whole
    corpus: `N` and `avgdl` are over all of them). Query tokens are de-duplicated, keeping first
    appearance. A passage is relevant when the number of DISTINCT query tokens it contains is at
    least `min(MIN_MATCHED, len(query_tokens))` and its BM25 score is above zero. Relevant
    passages are ranked by score; ties break by source name then passage index; at most `top`
    are returned. An empty query (no tokens after stopwords) returns nothing.
    """
    query_tokens = list(dict.fromkeys(tokenize(query)))      # de-duplicated, order kept
    if not query_tokens or not docs:
        return []
    need = min(MIN_MATCHED, len(query_tokens))

    doc_tokens = [tokenize(text) for _, _, text in docs]
    n = len(docs)
    lengths = [len(toks) for toks in doc_tokens]
    avgdl = (sum(lengths) / n) if n else 0.0

    df: Dict[str, int] = {term: 0 for term in query_tokens}
    for toks in doc_tokens:
        present = set(toks)
        for term in query_tokens:
            if term in present:
                df[term] += 1
    idf = {term: math.log(1 + (n - df[term] + 0.5) / (df[term] + 0.5)) for term in query_tokens}

    results: List[Passage] = []
    for (source, index, text), toks, dl in zip(docs, doc_tokens, lengths):
        score = 0.0
        matched = 0
        for term in query_tokens:
            freq = toks.count(term)
            if freq == 0:
                continue
            matched += 1
            # (B * dl) / avgdl, in the web port's order, so both round alike. avgdl > 0 here:
            # this passage holds a token.
            denom = freq + K1 * (1 - B + (B * dl) / avgdl)
            score += idf[term] * (freq * (K1 + 1)) / denom
        if matched >= need and score > 0:
            results.append(Passage(source, index, text, score))

    results.sort(key=lambda p: (-p.score, p.source, p.index))
    return results[:top]


def fit_budget(passages: Sequence[Passage], limit: int = BUDGET_CHARS) -> List[Passage]:
    """The ranked passages trimmed to `limit` characters of text in total.

    Passages that fit whole are kept in rank order. The first one that overflows is cut to the
    characters that remain — `text[:left - 1].rstrip(TRIM) + "…"` — but only when at least
    `MIN_PIECE` remain; otherwise it (and everything after it) is dropped. Nothing follows a cut
    passage. Lengths count code points (Python's `len`; the web counts the same way), and only
    `TRIM` is trimmed (not every Unicode space), so both sides cut alike. This mirrors the web
    port exactly; the vectors' `budget` section checks it.
    """
    kept: List[Passage] = []
    left = limit
    for passage in passages:
        length = len(passage.text)
        if length <= left:
            kept.append(passage)
            left -= length
            continue
        if left >= MIN_PIECE:
            piece = passage.text[:left - 1].rstrip(TRIM) + "…"
            kept.append(Passage(passage.source, passage.index, piece, passage.score))
        break
    return kept
