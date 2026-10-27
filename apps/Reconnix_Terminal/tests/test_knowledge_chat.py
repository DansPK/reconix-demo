"""The terminal chat uses /add-on knowledge: the fenced block in the context and the
Knowledge: line (which is never replayed to the model as its own words)."""

import re

import pytest

from reconix import store
from reconix.llm import client

from .support import SIZE, run_to, run_ui_to, settle, type_request, wait_until

_CORPUS = {
    "runbook.md": "SQL injection was found in the search endpoint and marked high severity.",
    "policy.txt": "Scope approval requires a signed authorization from the system owner.",
    "notes.md": "The login form accepts an email and a password over HTTPS only.",
}


@pytest.fixture
def chat_model(monkeypatch):
    """A configured, reachable, active model that records every completion's messages."""
    monkeypatch.setattr(client, "ping", lambda *a, **k: (True, "reachable"))
    calls = []

    def complete(pid, model, messages, **kw):
        calls.append(messages)
        return "a short reply"

    monkeypatch.setattr(client, "complete", complete)
    store.set_provider("openai", api_key="sk-x-1234", models=["gpt-4o-mini"])
    store.test_provider("openai")
    store.activate("openai", "gpt-4o-mini")
    return calls


def _add_corpus(tmp_path):
    for name, text in _CORPUS.items():
        p = tmp_path / name
        p.write_text(text)
        store.add_source(str(p))


def _reconix_notes():
    return [c.text for c in store.list_chat() if c.speaker == "reconix"]


def test_relevant_line_adds_the_block_and_the_knowledge_note(chat_model, tmp_path):
    _add_corpus(tmp_path)
    run_to("scope")
    store.say_to_assistant("what sql injection severity was in the search endpoint?")

    context = chat_model[-1][1]["content"]              # messages[1] is the scrubbed context
    assert "Internal knowledge (from /add-on files" in context
    assert "[runbook.md #0]" in context
    assert any(n.startswith("Knowledge: ") and "runbook.md" in n for n in _reconix_notes())


def test_irrelevant_line_has_no_block_and_no_note(chat_model, tmp_path):
    _add_corpus(tmp_path)
    run_to("scope")
    store.say_to_assistant("hello, how are you today?")

    context = chat_model[-1][1]["content"]
    assert "Internal knowledge" not in context
    assert not any(n.startswith("Knowledge:") for n in _reconix_notes())


def test_the_block_is_fenced_with_a_fresh_tag_one_passage_per_line(chat_model, tmp_path):
    p = tmp_path / "multi.md"
    p.write_text("SQL injection in the search endpoint:\nline two of the passage\n\tline three.")
    store.add_source(str(p))
    run_to("scope")
    store.say_to_assistant("sql injection in the search endpoint?")
    store.say_to_assistant("sql injection search endpoint again?")

    tags = []
    for messages in chat_model[-2:]:
        context = messages[1]["content"]
        found = re.findall(r"<<(knowledge_[0-9a-f]{16})>>\n(.*?)\n<</\1>>", context, re.S)
        assert len(found) == 1
        tag, body = found[0]
        tags.append(tag)
        assert body.count("\n") == 0                     # one passage, one line
        assert body == ("[multi.md #0] SQL injection in the search endpoint: line two of the "
                        "passage line three.")
        assert f"between <<{tag}>> and <</{tag}>>" in context   # the header names the fence
        assert "untrusted" in context
    assert tags[0] != tags[1]                            # a new tag for every question


def test_muted_notes_are_not_replayed_as_the_models_words(chat_model, tmp_path):
    _add_corpus(tmp_path)
    run_to("scope")
    store.say_to_assistant("what sql injection severity was in the search endpoint?")
    assert any(n.startswith("Knowledge: ") for n in _reconix_notes())
    store.say_to_assistant("and the second question")

    history = [m["content"] for m in chat_model[-1][2:-1]]   # between context and new line
    muted = {c.text for c in store.list_chat() if c.tone == "muted"}
    assert any(text.startswith("Knowledge: ") for text in muted)
    assert "a short reply" in history                    # the model's own words stay
    assert not muted & set(history)                      # Reconix's muted notes don't
    assert not any("Knowledge:" in text for text in history)


async def test_after_the_run_a_typed_question_shows_the_knowledge_line(
        app, chat_model, tmp_path):
    _add_corpus(tmp_path)
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)
        assert store.is_finished()
        app.goto("start")
        await settle(pilot)
        await type_request(pilot, "what sql injection severity was in the search endpoint?")
        await wait_until(pilot, lambda: any(n.startswith("Knowledge: ")
                                            for n in _reconix_notes()), what="Knowledge line")
        assert "Knowledge: runbook.md" in _reconix_notes()
        assert "[runbook.md #0]" in chat_model[-1][1]["content"]


def test_no_knowledge_without_a_model(tmp_path):
    # No active model: the built-in reply path runs and never touches the knowledge folder.
    _add_corpus(tmp_path)
    run_to("scope")
    store.say_to_assistant("what sql injection severity was in the search endpoint?")
    assert not any(n.startswith("Knowledge:") for n in _reconix_notes())
