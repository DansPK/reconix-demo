"""Agent mode in the TUI: a target enters the Template frame, then the agent runs on scope
approval and its events drive the Execution screen + chat.

`agent_run.run` is mocked, so no harness, LLM or Kali VM is touched — we verify the TUI
wiring (flow entry, scope hand-off, event rendering, plan/findings in the store).
"""

import pytest

from reconix import store
from reconix.store import agent_run

from .support import SIZE, settle, wait_until


@pytest.fixture
def fake_agent(monkeypatch):
    """Replace the bridge's run with a fake that streams a plan + a scan + a reply."""
    calls = []

    async def fake_run(text, on_event, on_ask=None):
        calls.append(text)
        await on_event({"type": "plan", "steps": [
            {"text": "recon", "status": "done"}, {"text": "test SQLi", "status": "running"}]})
        await on_event({"type": "tool_start", "name": "run_scan", "args": {"target": text}})
        await on_event({"type": "assistant", "text": f"done with {text}"})

    monkeypatch.setattr(agent_run, "run", fake_run)
    return calls


def _chat_texts():
    return [c.text for c in store.list_chat()]


async def test_assess_enters_template_then_runs_on_scope_approval(app, model_active, fake_agent):
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/assess http://target.example")
        await wait_until(pilot, lambda: app.agent_mode, what="agent mode")
        await settle(pilot)                            # the Template frame mounts
        assert app.agent_mode is True
        assert fake_agent == []                       # not run yet — waiting at Template/scope

        app.approve_scope()                            # operator approves the scope
        await wait_until(pilot, lambda: any("done with" in t for t in _chat_texts()),
                         what="the agent reply")
        assert len(fake_agent) == 1                     # agent ran once
        assert "http://target.example" in fake_agent[0]  # on the approved target
        assert "authorized" in fake_agent[0].lower()     # told to proceed, not ask
        assert any("done with" in t for t in _chat_texts())
        # the plan drove the Execution task rows
        labels = [t.label for t in store.plan_tasks()]
        assert "recon" in labels and "test SQLi" in labels


async def test_natural_language_chats_with_the_agent(app, model_active, fake_agent):
    # A non-target sentence is a chat turn with the agent, not a scan target rejection.
    async with app.run_test(size=SIZE) as pilot:
        app.submit_request("what vulnerabilities should I look for?")
        await wait_until(pilot, lambda: any("done with what" in t for t in _chat_texts()),
                         what="the agent reply")
        assert app.agent_mode is False                # plain chat, no assessment started
        assert store.get_run().started is False
        assert fake_agent == ["what vulnerabilities should I look for?"]
        assert any("done with what vulnerabilities" in t for t in _chat_texts())


async def test_typed_target_routes_to_agent_when_model_active(app, model_active, fake_agent):
    async with app.run_test(size=SIZE) as pilot:
        app.submit_request("scan http://host.example")
        await wait_until(pilot, lambda: app.agent_mode, what="agent mode")
        await settle(pilot)                            # the Template frame mounts
        assert app.agent_mode is True                 # entered agent flow (Template), not run yet
        assert fake_agent == []


async def test_chat_blocked_while_running_then_allowed_when_done(app, model_active, fake_agent):
    # No chat during a running scan/PoC; chat resumes once the turn finishes.
    async with app.run_test(size=SIZE) as pilot:
        app.agent_mode = True
        app._agent_busy = True                        # a turn is running
        before = len(store.list_chat())
        app._send_to_agent("what have you found so far?")
        await settle(pilot)
        assert len(store.list_chat()) == before       # the line was not accepted
        assert fake_agent == []                        # no agent turn ran

        app._agent_busy = False                        # the assessment turn finished
        app._send_to_agent("now what did you find?")
        await wait_until(pilot, lambda: fake_agent == ["now what did you find?"],
                         what="the agent turn")
        assert fake_agent == ["now what did you find?"]   # chat accepted once done


async def test_assess_without_model_warns(app, fake_agent):
    # No model active → agent mode refuses, nothing starts.
    async with app.run_test(size=SIZE) as pilot:
        app.start_agent_assessment("http://target.example")
        await settle(pilot)
        assert app.agent_mode is False
        assert fake_agent == []
