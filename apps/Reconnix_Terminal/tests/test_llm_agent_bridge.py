"""The harness bridge: a mid-assessment model switch preserves conversation context.

This is the PoC's automated proof. LiteLLM is mocked, so no network, LLM or Kali VM is
touched; the agent runs its real loop and history, and we assert the second model receives
the first model's turns.
"""

from types import SimpleNamespace

import litellm
import pytest

from reconix import store
from reconix.store import agent_run


@pytest.fixture
def two_providers(monkeypatch):
    """OpenAI and Ollama configured + REACHABLE (reachability mocked)."""
    monkeypatch.setattr("reconix.llm.client.ping", lambda *a, **k: (True, "reachable"))
    store.set_provider("openai", api_key="sk-openai-xxxx", models=["gpt-4o-mini"])
    store.set_provider("ollama", models=["llama3.1"])
    store.test_provider("openai")
    store.test_provider("ollama")


@pytest.fixture
def record_llm(monkeypatch):
    """Capture every LiteLLM call; reply with plain text (no tool calls → one round)."""
    calls = []

    async def fake_acompletion(**kwargs):
        calls.append(kwargs)
        message = SimpleNamespace(content="noted.", tool_calls=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    monkeypatch.setattr(litellm, "acompletion", fake_acompletion)
    return calls


async def _say(text):
    events = []

    async def on_event(ev):
        events.append(ev)

    await agent_run.run(text, on_event)
    return events


async def test_switch_model_mid_assessment_preserves_context(two_providers, record_llm):
    store.activate("openai", "gpt-4o-mini")
    await _say("recon the target staging.example.com, I am authorized")

    store.activate("ollama", "llama3.1")
    assert agent_run.switch_model() is True            # same Agent, new client
    await _say("what did you find so far?")

    # The second model's request carries the first turn's user line and reply.
    last = record_llm[-1]
    convo = " ".join((m.get("content") or "") for m in last["messages"])
    assert "staging.example.com" in convo              # first user line preserved
    assert "noted." in convo                           # first model's reply preserved
    assert last["model"] == "ollama_chat/llama3.1"     # and it is the new model


async def test_run_without_active_model_raises(two_providers, record_llm):
    # Nothing activated → the bridge refuses rather than guessing a model.
    with pytest.raises(store.StoreValidationError):
        await _say("do something")


async def test_switch_without_agent_is_noop(two_providers):
    store.activate("openai", "gpt-4o-mini")
    assert agent_run.switch_model() is False           # no agent created yet


def test_ingest_scan_findings_maps_harness_to_store():
    from types import SimpleNamespace

    from harness.models import Finding as HFinding
    from harness.models import Severity

    from reconix.store.snapshot import uid_for

    hf1 = HFinding(scan_id=1, severity=Severity.HIGH, title="SQL injection in q",
                   description="injectable", evidence="q=1' OR '1'='1", location="/search",
                   verified=True, id=1)
    hf2 = HFinding(scan_id=1, severity=Severity.LOW, title="OWASP Juice Shop",
                   description="", evidence="", location="/", verified=False, id=2)
    # Info, unknown and empty severities (an old row, a foreign value) are never stored.
    skipped = [HFinding(scan_id=1, severity=sev, title=f"skipped {sev!r}", description="",
                        evidence="", location="/x", verified=False, id=10 + i)
               for i, sev in enumerate(["info", "bogus", "", None])]
    stub = SimpleNamespace(db=SimpleNamespace(
        findings_for_target=lambda tid: [hf1, hf2] + skipped))
    agent_run._agents[uid_for(store.get_assessment())] = stub

    added = agent_run.ingest_scan_findings({"target": {"id": 1}})
    assert added == 2
    by_title = {f.title: f for f in store.list_findings()}
    assert by_title["SQL injection in q"].severity == "HIGH"
    assert by_title["SQL injection in q"].validation == "CONFIRMED"
    assert by_title["SQL injection in q"].fid.startswith("AI-")
    assert by_title["OWASP Juice Shop"].validation == "UNCONFIRMED"
    assert not any(t.startswith("skipped") for t in by_title)
    assert {f.severity for f in store.list_findings()} <= set(store.SEVERITY_ORDER)
    assert agent_run.ingest_scan_findings({"target": {"id": 1}}) == 0   # deduped


def test_widen_scope_tools_lists_the_agent_toolset():
    from .support import run_to

    run_to("scope")                                  # a DRAFT scope awaits approval
    before = list(store.get_scope().tools)
    agent_run.widen_scope_tools()
    tools = store.get_scope().tools
    assert {"nmap", "nuclei", "sqlmap"} <= set(tools)   # many tools now allowed
    assert len(tools) >= len(before)


def test_reasoning_event_renders_as_muted_thinking():
    agent_run.record_event({"type": "reasoning", "text": "step 1 recon, step 2 decide"})
    last = store.list_chat()[-1]
    assert last.speaker == "reconix" and last.tone == "muted"
    assert "thinking" in last.text and "step 1 recon" in last.text
