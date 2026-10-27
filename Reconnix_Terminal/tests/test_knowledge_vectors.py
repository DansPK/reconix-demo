"""The shared ranking vectors: the Python ranker must reproduce web/tests/knowledge-vectors.json.

The web adds a TypeScript test against the same file, so both implementations stay identical.
"""

import importlib.util
import json
import sys
from pathlib import Path

from reconix.store.knowledge import rank

ROOT = Path(__file__).resolve().parents[1]
VECTORS = ROOT / "web" / "tests" / "knowledge-vectors.json"


def _data():
    return json.loads(VECTORS.read_text(encoding="utf-8"))


def _docs(data):
    docs = []
    for source in data["corpus"]:
        for index, text in enumerate(source["chunks"]):
            docs.append((source["name"], index, text))
    return docs


def _generator():
    spec = importlib.util.spec_from_file_location(
        "make_knowledge_vectors", ROOT / "scripts" / "make_knowledge_vectors.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules.setdefault("make_knowledge_vectors", module)
    spec.loader.exec_module(module)
    return module


def test_the_format_has_the_four_sections():
    assert set(_data()) == {"tokens", "corpus", "queries", "budget"}


def test_tokens_match():
    for case in _data()["tokens"]:
        assert rank.tokenize(case["input"]) == case["expected"], case["input"]


def test_queries_match_to_four_decimals():
    data = _data()
    docs = _docs(data)
    for case in data["queries"]:
        hits = rank.rank(docs, case["query"])
        got = [{"source": h.source, "index": h.index, "score": round(h.score, 4)} for h in hits]
        assert got == case["expected"], case["query"]


def test_budget_cases_match():
    for case in _data()["budget"]:
        passages = [rank.Passage("source.md", i, text, 1.0)
                    for i, text in enumerate(case["passages"])]
        got = [p.text for p in rank.fit_budget(passages, case["budget"])]
        assert got == case["expected"], case["budget"]


def test_the_cases_cover_ties_repeats_stopwords_and_non_ascii():
    data = _data()
    by_query = {case["query"]: case["expected"] for case in data["queries"]}
    ties = by_query["kerberos ticket"]
    assert len({e["score"] for e in ties}) == 1 and len(ties) == 3
    assert [(e["source"], e["index"]) for e in ties] == [("Beta.md", 0), ("Beta.md", 1),
                                                         ("alpha.md", 0)]
    assert by_query["firewall firewall DNS dns"] == by_query["firewall dns"]
    assert by_query["what is the and of"] == []
    assert by_query["vpn gateway"][0]["source"] == "gateway-short.md"
    assert any("🚀" in text for case in data["budget"] for text in case["expected"])


def test_file_is_what_the_generator_writes():
    generator = _generator()
    assert generator.render(generator.build()) == VECTORS.read_text(encoding="utf-8")
