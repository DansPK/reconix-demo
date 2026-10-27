"""Flexible LLM: chat replies, mid-task model switching, history and guardrails."""

import pytest

from reconix import store
from reconix.llm import client, db, guardrail
from reconix.store.snapshot import uid_for

from .support import TEST_PASSWORD, run_to


@pytest.fixture
def two_models(monkeypatch):
    """Ollama and OpenAI both configured and REACHABLE; records every completion call."""
    monkeypatch.setattr(client, "ping", lambda pid, model, **kw: (True, "reachable"))
    store.set_provider("ollama", models=["llama3.1"])
    store.set_provider("openai", api_key="sk-openai-key-1234", models=["gpt-4o-mini", "gpt-4o"])
    store.test_provider("ollama")
    store.test_provider("openai")

    calls = []

    def complete(pid, model, messages, **kw):
        calls.append({"provider": pid, "model": model, "messages": messages})
        return f"reply from {pid}/{model}"

    monkeypatch.setattr(client, "complete", complete)
    return calls


def _last_reply() -> str:
    return [c for c in store.list_chat() if c.speaker == "reconix"][-1].text


# --- a model answers --------------------------------------------------------------

def test_chat_line_uses_active_model(two_models):
    run_to("scope")
    store.activate("ollama", "llama3.1")
    store.say_to_assistant("what's the risk here?")
    assert two_models[-1]["provider"] == "ollama"
    assert _last_reply() == "reply from ollama/llama3.1"


def test_switch_model_between_lines(two_models):
    run_to("scope")
    store.activate("ollama", "llama3.1")
    store.say_to_assistant("first question")
    store.activate("openai", "gpt-4o-mini")
    store.say_to_assistant("second question")
    assert two_models[-1]["provider"] == "openai"
    assert two_models[-1]["model"] == "gpt-4o-mini"


def test_switch_provider_mid_task_preserves_run(two_models):
    run_to("scope")                                    # a gate is waiting
    gate_before = store.waiting_gate()
    findings_before = [f.fid for f in store.list_findings()]
    decisions_before = len(store.list_approval_decisions())

    store.activate("ollama", "llama3.1")
    store.say_to_assistant("talk to me on ollama")
    store.activate("openai", "gpt-4o-mini")            # switch while the gate waits
    store.say_to_assistant("now on openai")

    assert store.waiting_gate() == gate_before
    assert [f.fid for f in store.list_findings()] == findings_before
    assert len(store.list_approval_decisions()) == decisions_before
    assert store.get_run().started


def test_history_carries_across_the_switch(two_models):
    run_to("scope")
    store.activate("ollama", "llama3.1")
    store.say_to_assistant("remember apples")
    store.activate("openai", "gpt-4o-mini")
    store.say_to_assistant("what did I say?")
    sent = " ".join(m["content"] for m in two_models[-1]["messages"])
    assert "remember apples" in sent                   # operator line to the old model
    assert "reply from ollama/llama3.1" in sent        # the old model's reply


def test_context_lists_findings_and_decisions(two_models):
    run_to(None)                                       # run to the end: findings exist
    store.activate("openai", "gpt-4o-mini")
    store.say_operator_line("summarize")
    store.llm_answer("summarize")
    context = two_models[-1]["messages"][1]["content"]
    assert store.list_findings()[0].fid in context
    assert "findings" in context


def test_history_saved_to_db(two_models):
    run_to("scope")
    store.activate("openai", "gpt-4o-mini")
    store.say_to_assistant("log this")
    rows = db.list_chat_messages(uid_for(store.get_assessment()))
    roles = [(r["role"], r["provider_id"], r["model"]) for r in rows]
    assert ("user", None, None) in roles
    assert ("assistant", "openai", "gpt-4o-mini") in roles


# --- guardrails stay identical and strict -----------------------------------------

def test_system_prompt_identical_across_models(two_models):
    run_to("scope")
    store.activate("ollama", "llama3.1")
    store.say_to_assistant("a")
    system_a = two_models[-1]["messages"][0]["content"]
    store.activate("openai", "gpt-4o-mini")
    store.say_to_assistant("b")
    system_b = two_models[-1]["messages"][0]["content"]
    assert system_a == system_b == guardrail.SYSTEM_PROMPT


def test_secret_typed_in_chat_is_redacted(two_models):
    run_to("scope")
    store.activate("openai", "gpt-4o-mini")
    store.say_to_assistant(f"here is my password={TEST_PASSWORD} ok?")
    sent = " ".join(m["content"] for m in two_models[-1]["messages"])
    assert TEST_PASSWORD not in sent                   # masked before it reaches the model


def test_approval_still_needs_token_and_hash_after_switch(two_models):
    run_to("approval:approval-002")                    # the HIGH-risk gate
    store.activate("openai", "gpt-4o-mini")
    store.say_to_assistant("should I approve?")        # the model cannot approve
    request = store.get_approval("approval-002")
    with pytest.raises(store.StoreValidationError):    # HIGH needs the single-use token
        store.approve(request.request_id, command_hash=request.command_hash)


# --- fallback keeps the demo working ----------------------------------------------

def test_no_active_model_uses_builtin_reply():
    run_to("scope")
    store.say_to_assistant("hello there")
    assert _last_reply()                               # a built-in reply was produced


def test_llm_error_falls_back_with_a_note(two_models, monkeypatch):
    from reconix.llm import LLMError

    def boom(*a, **k):
        raise LLMError("timed out")

    monkeypatch.setattr(client, "complete", boom)
    run_to("scope")
    store.activate("openai", "gpt-4o-mini")
    store.say_to_assistant("are you there?")
    replies = [c.text for c in store.list_chat() if c.speaker == "reconix"]
    assert any("LLM unavailable" in r for r in replies)
