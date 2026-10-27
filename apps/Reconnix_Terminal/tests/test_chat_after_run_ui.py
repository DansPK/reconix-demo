"""Chatting on after the run: a finished (or stopped) assessment keeps its conversation.

Every typed line after the run is a chat turn about that same assessment, with its history
and context. A new assessment starts only with /new, /assess or /template.
"""

from types import SimpleNamespace

import litellm
import pytest

from reconix import store
from reconix.llm import client
from reconix.store import agent_run, replies
from reconix.store.snapshot import uid_for
from reconix.widgets import PromptBox

from .support import SIZE, run_ui_to, settle, type_request, wait_until


def _uid() -> str:
    return uid_for(store.get_assessment())


def _chat(speaker: str):
    return [c.text for c in store.list_chat() if c.speaker == speaker and c.kind == "text"]


@pytest.fixture
def model_calls(monkeypatch):
    """Records every completion the active model is asked for."""
    calls = []

    def complete(pid, model, messages, **kw):
        calls.append(messages)
        return f"model answer {len(calls)}"

    monkeypatch.setattr(client, "complete", complete)
    return calls


# --- scripted run, built-in replies --------------------------------------------------------
async def test_line_after_finished_run_stays_on_the_same_assessment(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)
        assert store.is_completed()
        uid, cards = _uid(), len(store.list_assessments())
        findings = [f.fid for f in store.list_findings()]

        app.goto("start")
        await settle(pilot)
        await type_request(pilot, "thanks, what did you find?")

        assert _uid() == uid
        assert len(store.list_assessments()) == cards
        assert [f.fid for f in store.list_findings()] == findings
        assert store.is_completed()
        assert "thanks, what did you find?" in _chat("you")
        assert _chat("reconix")[-1] == replies.reply_after_run("thanks")
        assert _chat("reconix")[-1] != replies.RUNNING


async def test_default_reply_after_run_points_to_findings_report_and_new(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)
        app.goto("start")
        await settle(pilot)
        await type_request(pilot, "explain the worst one")
        assert _chat("reconix")[-1] == replies.AFTER_RUN
        assert "/new" in replies.AFTER_RUN


async def test_a_target_after_the_run_is_chat_not_a_new_assessment(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)
        uid = _uid()
        app.goto("start")
        await settle(pilot)
        await type_request(pilot, "http://another.example")
        assert _uid() == uid
        assert "http://another.example" in _chat("you")


async def test_stopped_run_keeps_chatting(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "scope")
        store.stop_run()
        assert store.get_run().stopped
        uid, cards = _uid(), len(store.list_assessments())
        app.goto("start")
        await settle(pilot)
        await type_request(pilot, "hello")
        assert _uid() == uid
        assert len(store.list_assessments()) == cards
        assert store.get_run().stopped
        assert _chat("reconix")[-1] == replies.reply_after_run("hello")


async def test_empty_line_after_the_run_opens_findings(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)
        assert store.list_findings()
        app.goto("start")
        await settle(pilot)
        await type_request(pilot, "")
        assert app.screen.flow_name == "findings"


async def test_empty_line_after_a_run_without_findings_opens_report(app, monkeypatch):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)
        monkeypatch.setattr(store, "list_findings", lambda *a, **k: [])
        app.goto("start")
        await settle(pilot)
        await type_request(pilot, "")
        assert app.screen.flow_name == "report"


async def test_new_still_starts_a_fresh_assessment(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)
        uid, cards = _uid(), len(store.list_assessments())
        app.run_command_line("/new")
        await settle(pilot)
        assert not store.get_run().started
        assert _uid() != uid
        assert len(store.list_assessments()) == cards + 1     # the finished one stays listed


# --- with an active model ------------------------------------------------------------------
async def test_model_answers_after_the_run_with_history_and_findings(
        app, model_active, model_calls):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)
        fid = store.list_findings()[0].fid
        uid = _uid()
        app.goto("start")
        await settle(pilot)

        await type_request(pilot, "first question about the results")
        await wait_until(pilot, lambda: "model answer 1" in _chat("reconix"), what="reply 1")
        await type_request(pilot, "and a second one")
        await wait_until(pilot, lambda: "model answer 2" in _chat("reconix"), what="reply 2")

        assert _uid() == uid
        sent = " ".join(m["content"] for m in model_calls[-1])
        assert "first question about the results" in sent      # earlier turns kept
        assert "model answer 1" in sent
        assert "and a second one" in sent
        assert fid in sent                                     # the findings context
        assert "finished" in sent and "completed" in sent      # and that the run is over


# --- the c key ------------------------------------------------------------------------------
async def test_c_on_findings_opens_chat(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)
        app.goto("findings")
        await settle(pilot)
        await pilot.press("c")
        await settle(pilot)
        assert app.screen.flow_name == "start"
        assert app.screen.query_one(PromptBox).input.value == ""


async def test_c_on_report_opens_chat(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)
        app.goto("report")
        await settle(pilot)
        await pilot.press("c")
        await settle(pilot)
        assert app.screen.flow_name == "start"


async def test_c_on_finding_detail_drafts_about_the_finding(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)
        finding = store.list_findings()[0]
        app.open_finding(finding.fid)
        await settle(pilot)
        assert app.screen.flow_name == "detail"
        await pilot.press("c")
        await settle(pilot)
        assert app.screen.flow_name == "start"
        assert app.screen.query_one(PromptBox).input.value == (
            f"About {finding.fid} {finding.title}: ")


# --- agent mode ------------------------------------------------------------------------------
async def test_agent_chat_continues_with_the_same_agent_after_finish(
        app, model_active, monkeypatch):
    seen = []

    async def fake_acompletion(**kwargs):
        seen.append([dict(m) for m in kwargs["messages"]])
        message = SimpleNamespace(content=f"noted {len(seen)}.", tool_calls=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    monkeypatch.setattr(litellm, "acompletion", fake_acompletion)
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)               # the run is over
        uid = _uid()
        app.agent_mode = True
        app._send_to_agent("summarise the engagement")
        await wait_until(pilot, lambda: len(seen) == 1 and not app._agent_busy,
                         what="the first agent turn")
        agent = agent_run._agents[uid]
        assert store.is_completed()                     # _agent_finished ran the real path

        assert app.submit_request("which finding is worst?") is True
        await wait_until(pilot, lambda: len(seen) == 2 and not app._agent_busy,
                         what="the second agent turn")

        assert agent_run._agents[uid] is agent          # same Agent, not a new one
        assert _uid() == uid
        convo = " ".join((m.get("content") or "") for m in seen[-1])
        assert "summarise the engagement" in convo      # its history is intact
        assert "noted 1." in convo
        assert "which finding is worst?" in convo


# --- stopped at the login: a pasted password never reaches the chat or a model ----------------
@pytest.mark.parametrize("gate", ["account", "code"])
async def test_password_pasted_after_a_stop_at_the_login_is_refused(
        app, model_active, model_calls, monkeypatch, gate):
    from reconix.store import lists, persist

    from .support import TEST_PASSWORD, screen_text

    warnings = []
    monkeypatch.setattr(app, "notify", lambda msg, **kw: warnings.append(str(msg)))
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, gate)
        store.stop_run()
        assert store.get_run().stopped and store.get_run().stopped_at_gate == gate
        chat_before = len(store.list_chat())
        app.goto("start")
        await settle(pilot)
        await type_request(pilot, TEST_PASSWORD)
        await settle(pilot)

        assert model_calls == []                                  # no model was asked
        assert any("stopped at the target login" in w for w in warnings)
        assert len(store.list_chat()) == chat_before
        assert TEST_PASSWORD not in repr(store.list_chat())
        assert TEST_PASSWORD not in repr(store.list_history())
        assert TEST_PASSWORD not in repr(store.list_events())
        assert TEST_PASSWORD not in repr(lists.current().requests)
        assert TEST_PASSWORD not in screen_text(app.screen)
        assert not any(TEST_PASSWORD in warning for warning in warnings)
        for path in persist.DATA_DIR.glob("*.json"):
            assert TEST_PASSWORD not in path.read_text(encoding="utf-8")
