"""The AI agent's knowledge tool: offered only with knowledge, dispatched, guard-allowed,
kept to the budget, and kept out of the saved timeline."""

from types import SimpleNamespace

import pytest

from reconix import store
from reconix.store import agent_guard, agent_run
from reconix.store.snapshot import uid_for

from .support import run_to

pytest.importorskip("harness")

from harness.agent import Agent  # noqa: E402
from harness.config import load_settings  # noqa: E402


def _tool_names(agent):
    return [t["function"]["name"] for t in agent.tools]


def test_tool_only_present_with_knowledge():
    settings = load_settings()
    without = Agent(settings)
    assert "search_knowledge" not in _tool_names(without)

    with_knowledge = Agent(settings, knowledge=lambda q: [{"source": "a.md", "index": 0,
                                                           "text": "ref"}])
    assert "search_knowledge" in _tool_names(with_knowledge)
    # The system prompt names the reference material only when the tool is present.
    assert "search_knowledge" in with_knowledge.history[0]["content"]
    assert "search_knowledge" not in without.history[0]["content"]


async def test_dispatch_returns_passages():
    agent = Agent(load_settings(),
                  knowledge=lambda q: [{"source": "a.md", "index": 1, "text": "ref"}])
    result = await agent._dispatch("search_knowledge", {"query": "anything"})
    assert result == {"passages": [{"source": "a.md", "index": 1, "text": "ref"}]}


async def test_dispatch_is_empty_without_knowledge():
    agent = Agent(load_settings())
    assert await agent._dispatch("search_knowledge", {"query": "x"}) == {"passages": []}


def test_guard_allows_search_knowledge():
    run_to("plan")                                     # an approved scope
    agent_run.begin_execution()
    guard = agent_guard.make_guard(uid_for(store.get_assessment()),
                                   lambda ref: None, lambda a, kind: [])
    assert guard("search_knowledge", {"query": "anything"}) == ""


def test_agent_run_wires_store_knowledge(tmp_path, model_active):
    corpus = {
        "runbook.md": "SQL injection was found in the search endpoint and marked high severity.",
        "policy.txt": "Scope approval requires a signed authorization from the system owner.",
        "notes.md": "The login form accepts an email and a password over HTTPS only.",
    }
    for name, text in corpus.items():
        p = tmp_path / name
        p.write_text(text)
        store.add_source(str(p))

    agent = agent_run._agent()
    assert "search_knowledge" in _tool_names(agent)

    rows = agent_run._knowledge_search("sql injection severity endpoint search")
    assert rows and all(set(r) == {"source", "index", "text"} for r in rows)
    assert rows[0]["source"] == "runbook.md"


def test_the_agent_tool_keeps_to_the_4000_character_budget(tmp_path):
    from reconix.store.knowledge import BUDGET_CHARS

    for i in range(4):                          # four relevant 1,100-character passages
        p = tmp_path / f"long{i}.md"
        p.write_text(f"Kerberos ticket renewal note {i}. " + "domain controller " * 60)
        store.add_source(str(p))
    rows = agent_run._knowledge_search("kerberos ticket renewal")
    assert len(rows) >= 3
    assert sum(len(r["text"]) for r in rows) <= BUDGET_CHARS
    assert rows[-1]["text"].endswith("…")       # the last one cut to what was left


# --- the activity log (and so the saved timeline) never holds the query or a passage -------
_PASSAGE = "The break-glass account for the staging VPN is kept in vault folder seven."
_QUERY = "where is the break-glass account kept"


def test_record_event_logs_only_counts_for_search_knowledge():
    agent_run.record_event({"type": "tool_start", "name": "search_knowledge",
                            "args": {"query": _QUERY}})
    agent_run.record_event({"type": "tool_end", "name": "search_knowledge", "result": {
        "passages": [{"source": "vpn.md", "index": 0, "text": _PASSAGE},
                     {"source": "vpn.md", "index": 3, "text": _PASSAGE},
                     {"source": "keys.md", "index": 1, "text": _PASSAGE}]}})
    agent_run.record_event({"type": "tool_end", "name": "search_knowledge",
                            "result": {"error": "OSError('/home/x')", "passages": []}})
    lines = [e.message for e in store.list_activity()][-2:]
    assert lines == ["search_knowledge: 3 passages from 2 files",
                     "search_knowledge: the knowledge search failed"]


def _tool_call_reply(call_id, name, args):
    import json

    call = SimpleNamespace(id=call_id, function=SimpleNamespace(name=name,
                                                                arguments=json.dumps(args)))
    return SimpleNamespace(choices=[SimpleNamespace(
        message=SimpleNamespace(content=None, tool_calls=[call]))])


def _text_reply(text):
    return SimpleNamespace(choices=[SimpleNamespace(
        message=SimpleNamespace(content=text, tool_calls=None))])


async def test_an_agent_turn_searches_knowledge_end_to_end(tmp_path, model_active, monkeypatch):
    """Agent.chat with a stubbed model: it calls search_knowledge, the store's passages come
    back to the model, and the saved snapshot holds neither the query nor the passage."""
    import json

    import litellm

    from reconix.store.snapshot import snapshot

    p = tmp_path / "vpn.md"
    p.write_text(_PASSAGE)
    store.add_source(str(p))
    run_to("plan")
    agent_run.begin_execution()

    sent = []
    replies = [_tool_call_reply("c1", "search_knowledge", {"query": _QUERY}),
               _text_reply("The runbook names a vault folder; ask the owner.")]

    async def fake_acompletion(**kwargs):
        sent.append([dict(m) for m in kwargs["messages"]])
        return replies.pop(0)

    monkeypatch.setattr(litellm, "acompletion", fake_acompletion)

    async def on_event(ev):
        agent_run.record_event(ev)              # what the shell does on the app thread

    await agent_run.run("check the reference notes about the VPN", on_event)

    tool_messages = [m for m in sent[-1] if m.get("role") == "tool"]
    assert tool_messages and tool_messages[-1]["name"] == "search_knowledge"
    assert "vault folder seven" in tool_messages[-1]["content"]     # the model got the passage
    assert "search_knowledge: 1 passage from 1 file" in [e.message for e in store.list_activity()]

    saved = json.dumps(snapshot(store.get_assessment()), ensure_ascii=False)
    assert "vault folder seven" not in saved and _QUERY not in saved
