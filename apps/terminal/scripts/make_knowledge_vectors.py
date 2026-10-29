"""Generate the shared knowledge ranking vectors from the Python ranker.

    python scripts/make_knowledge_vectors.py          # → web/tests/knowledge-vectors.json
    python scripts/make_knowledge_vectors.py --check   # exit 1 if the file is stale

The file is the contract between `reconix/store/knowledge/rank.py` and the web port
(`web/src/lib/assistant/knowledge`). It holds a `tokens` section (inputs → expected token
lists), a `corpus` (sources with plain-string passages), `queries` with the expected
ranked passages (score rounded to four decimals, top 4), and a `budget` section: each case
runs the 4,000-character fit (`fit_budget`) with its own `budget` over plain `passages` in
order and expects the kept `expected` texts (lengths in code points, a cut passage trimmed of
" \t\n\r" only, then "…"). A passage is relevant when the number of distinct query tokens it
contains is at least `min(2, len(query_tokens))` and its BM25 score is above zero.
`tests/test_knowledge_vectors.py` checks Python against it; the web adds a vitest.

The cases cover: exact ties (equal scores, broken by source name in code-point order, then by
passage index), repeated query tokens, a stopword-only query, accents and an emoji, and a
shorter passage outranking a longer one with the same matches.

Flattening (both sides must agree): iterate `corpus` in order; within each source iterate its
`chunks` in order; the passage index is its position in that source's `chunks`.
"""

import json
import sys
from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import reconix.store.knowledge.rank as rank  # noqa: E402  (the module, not the re-exported fn)

OUT = ROOT / "web" / "tests" / "knowledge-vectors.json"

# --- the corpus: 3 sources, 7 passages (plain strings) -------------------------------------
# alert.md is a one-passage source (shows a single-passage file being relevant). runbook.md #1
# and #2 split "sql/injection" from "severity" so a 1-of-3 match is excluded.
CORPUS = [
    {
        "name": "runbook.md",
        "chunks": [
            "The staging environment uses a shared database for all the test accounts.",
            "SQL injection was found in the search endpoint.",
            "The report lists each finding ranked by severity.",
        ],
    },
    {
        "name": "policy.txt",
        "chunks": [
            "Scope approval requires a signed authorization from the system owner.",
            "High risk actions need a double confirmation before the scanner runs.",
            "Never store plaintext passwords in the findings or the exported report.",
        ],
    },
    {
        "name": "alert.md",
        "chunks": [
            "Firewall blocks outbound DNS traffic on the staging host.",
        ],
    },
    # Exact ties: the same text in two sources and twice in one. "Beta.md" sorts before
    # "alpha.md" by code point (upper case first), though it comes later in the corpus.
    {
        "name": "alpha.md",
        "chunks": [
            "Kerberos ticket renewal runs nightly on every domain controller.",
        ],
    },
    {
        "name": "Beta.md",
        "chunks": [
            "Kerberos ticket renewal runs nightly on every domain controller.",
            "Kerberos ticket renewal runs nightly on every domain controller.",
        ],
    },
    # Accents and an emoji: only the ASCII letter runs are tokens ("façade" → "fa", "ade").
    {
        "name": "notes-é.md",
        "chunks": [
            "Café résumé naïve: the 🚀 rollout uses the façade service behind the proxy.",
        ],
    },
    # The same two matches in a long passage and a short one: the short one ranks first,
    # though the long one comes first in the corpus and by name.
    {
        "name": "gateway-long.md",
        "chunks": [
            "The vpn gateway terminates every remote tunnel, logs each session to the central "
            "collector, rotates its certificates monthly and keeps a warm standby in the "
            "second region for failover during maintenance windows.",
        ],
    },
    {
        "name": "gateway-short.md",
        "chunks": [
            "The vpn gateway is patched.",
        ],
    },
]

QUERIES = [
    "severity",                                 # single-token query (min matched = 1)
    "firewall dns",                             # two terms, only the one-passage alert.md
    "sql injection severity",                   # runbook #1 matches 2 of 3; #2 only 1 → excluded
    "scope approval authorization owner",       # policy.txt #0
    "test accounts database staging",           # runbook #0 (4); alert #0 matches 1 → excluded
    "kerberos ticket",                          # three exact ties: Beta #0, Beta #1, alpha #0
    "firewall firewall DNS dns",                # repeated tokens count once: as "firewall dns"
    "what is the and of",                       # stopwords only: no tokens, nothing relevant
    "façade rollout 🚀",                        # tokens "fa", "ade", "rollout"
    "vpn gateway",                              # the short passage first
]

TOKEN_INPUTS = [
    "SQL Injection in the Search API!",
    "A an the of to",
    "CVE-2021-44228 log4j RCE",
    "Don't reuse passwords!!!",
    "x y ab 12 999",
    "Café résumé naïve 🚀 façade",
    "ÀÉÎÕÜ ñ ß 東京 2024 v2.1-rc",
]

# --- the budget cases (`fit_budget` over plain passages, in order) -------------------------
_ROCKET = "\U0001F680"                          # one code point, two UTF-16 units
BUDGET_CASES = [
    (100, ["alpha", "beta"]),                                   # everything fits
    (10, ["0123456789", "x"]),                                  # an exact fit, then 0 left
    (300, ["a" * 100, "b" * 400]),                              # 200 left: cut to 199 + "…"
    (299, ["a" * 100, "b" * 400]),                              # 199 left: dropped
    (250, ["a" * 100, "b" * 300, "c" * 10]),                    # nothing after a dropped one
    (500, ["a" * 100, "b" * 600, "c" * 10]),                    # nothing after a cut one
    (210, [_ROCKET * 50 + " word" * 40]),                       # emoji count one each
    (210, ["x" * 208 + _ROCKET * 2 + "y" * 50]),                # an emoji right at the cut
    (200, ["a" * 194 + " \t\n\r " + "b" * 100]),                # trailing " \t\n\r" trimmed
    (200, ["a" * 197 + "\u00a0 " + "b" * 100]),                 # a no-break space is kept
]


def _docs():
    docs = []
    for source in CORPUS:
        for index, text in enumerate(source["chunks"]):
            docs.append((source["name"], index, text))
    return docs


def build() -> Dict[str, object]:
    docs = _docs()
    tokens = [{"input": text, "expected": rank.tokenize(text)} for text in TOKEN_INPUTS]
    queries: List[dict] = []
    for query in QUERIES:
        hits = rank.rank(docs, query)
        queries.append({
            "query": query,
            "expected": [
                {"source": p.source, "index": p.index, "score": round(p.score, 4)}
                for p in hits
            ],
        })
    budget = [
        {"budget": limit, "passages": texts,
         "expected": [p.text for p in rank.fit_budget(
             [rank.Passage("source.md", i, text, 1.0) for i, text in enumerate(texts)],
             limit)]}
        for limit, texts in BUDGET_CASES
    ]
    return {"tokens": tokens, "corpus": CORPUS, "queries": queries, "budget": budget}


def render(data: Dict[str, object]) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def main(argv=None) -> int:
    args = sys.argv[1:] if argv is None else argv
    expected = render(build())
    if args == ["--check"]:
        on_disk = OUT.read_text(encoding="utf-8") if OUT.exists() else None
        if on_disk == expected:
            print(f"{OUT.relative_to(ROOT)} is up to date")
            return 0
        print(f"{OUT.relative_to(ROOT)} is stale: run python scripts/make_knowledge_vectors.py",
              file=sys.stderr)
        return 1
    if args:
        print("usage: python scripts/make_knowledge_vectors.py [--check]", file=sys.stderr)
        return 2
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(expected, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
