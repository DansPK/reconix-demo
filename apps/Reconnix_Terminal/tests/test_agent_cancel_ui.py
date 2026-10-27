"""Cancelling an agent turn: `/assess` during a hung turn, a late event, an open question."""

import asyncio

import pytest

from reconix import store
from reconix.screens import ChoiceScreen
from reconix.store import agent_run

from .support import SIZE, settle, wait_until

TARGET = "http://target.example"


@pytest.fixture
def hung_agent(monkeypatch):
    """The first turn hangs (and, when cancelled, still tries to post one late event); later
    turns finish at once. `state` records what happened."""
    state = {"calls": [], "cancelled": False, "late_posted": False}

    async def fake_run(text, on_event, on_ask=None):
        state["calls"].append(text)
        if len(state["calls"]) > 1:
            return
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            state["cancelled"] = True
            await on_event({"type": "assistant", "text": "LATE-FROM-OLD-TURN"})
            state["late_posted"] = True             # on_event returned: the app has handled it
            raise

    monkeypatch.setattr(agent_run, "run", fake_run)
    return state


async def _start_running(app, pilot):
    app.run_command_line(f"/assess {TARGET}")
    await wait_until(pilot, lambda: store.waiting_gate() == "scope", what="the scope gate")
    app.approve_scope()
    await wait_until(pilot, lambda: app._agent_busy, what="the turn to start")
    await wait_until(pilot, lambda: app._agent_handle is not None, what="the worker to run")


async def test_assess_during_a_hung_turn_cancels_it(app, model_active, hung_agent):
    async with app.run_test(size=SIZE) as pilot:
        await _start_running(app, pilot)
        old_label = store.get_assessment().label
        assert store.get_run().completed is False

        app.run_command_line("/assess http://other.example.com")
        await wait_until(pilot, lambda: store.get_assessment().label != old_label,
                         what="the new assessment")
        assert app._agent_busy is False
        await wait_until(pilot, lambda: app.screen.__class__.__name__ == "TemplateScreen",
                         what="the Template frame")
        await wait_until(pilot, lambda: hung_agent["late_posted"], what="the late event")
        assert "LATE-FROM-OLD-TURN" not in [c.text for c in store.list_chat()]

        old = next(a for a in store.list_assessments() if a.label == old_label)
        assert old.status == "Stopped"              # not "Completed"


async def test_new_assessment_command_cancels_the_turn_too(app, model_active, hung_agent):
    async with app.run_test(size=SIZE) as pilot:
        await _start_running(app, pilot)
        app.new_assessment()
        await wait_until(pilot, lambda: hung_agent["late_posted"], what="the late event")
        assert app._agent_busy is False
        assert "LATE-FROM-OLD-TURN" not in [c.text for c in store.list_chat()]
        await settle(pilot)


async def test_cancel_closes_an_open_question_dialog(app, model_active, monkeypatch):
    got = {}

    async def asking_run(text, on_event, on_ask=None):
        got["answer"] = await on_ask({"type": "confirm", "question": "Run sqlmap?",
                                      "options": []})

    monkeypatch.setattr(agent_run, "run", asking_run)
    async with app.run_test(size=SIZE) as pilot:
        await _start_running(app, pilot)
        await wait_until(pilot, lambda: isinstance(app.screen, ChoiceScreen), what="the dialog")

        app.new_assessment()
        await wait_until(pilot, lambda: not isinstance(app.screen, ChoiceScreen),
                         what="the dialog to close")
        assert app._agent_busy is False
        assert app._agent_ask is None
        assert "answer" not in got                  # the cancelled turn gets no answer
        await settle(pilot)


async def test_cancel_drops_the_cached_agent_and_marks_the_run_stopped(
        app, model_active, hung_agent):
    from reconix.store.snapshot import uid_for

    async with app.run_test(size=SIZE) as pilot:
        await _start_running(app, pilot)
        uid = uid_for(store.get_assessment())
        agent_run._agents[uid] = object()           # as if the turn had built an Agent
        app.cancel_agent()
        assert uid not in agent_run._agents         # no history with unanswered tool calls
        assert store.get_run().stopped and not store.get_run().completed
        await wait_until(pilot, lambda: hung_agent["late_posted"], what="the late event")


async def test_cancel_twice_and_when_idle_is_harmless(app, model_active):
    async with app.run_test(size=SIZE) as pilot:
        app.cancel_agent()                          # nothing running, nothing open
        app.cancel_agent()
        assert app._agent_busy is False and not store.get_run().stopped
        await settle(pilot)


async def test_quit_cancel_leaves_the_run_unmarked(app, model_active, hung_agent):
    async with app.run_test(size=SIZE) as pilot:
        await _start_running(app, pilot)
        app.cancel_agent(mark_stopped=False)        # what on_unmount does
        assert app._agent_busy is False and not store.get_run().stopped
        await wait_until(pilot, lambda: hung_agent["late_posted"], what="the late event")


async def test_a_failed_turn_leaves_a_note_and_frees_the_chat(app, model_active, monkeypatch):
    async def failing_run(text, on_event, on_ask=None):
        raise RuntimeError("boom")

    monkeypatch.setattr(agent_run, "run", failing_run)
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line(f"/assess {TARGET}")
        await wait_until(pilot, lambda: store.waiting_gate() == "scope", what="the scope gate")
        app.approve_scope()
        await wait_until(pilot, lambda: any("Agent error" in c.text for c in store.list_chat()),
                         what="the failure note")
        await wait_until(pilot, lambda: not app._agent_busy, what="the chat to free up")
