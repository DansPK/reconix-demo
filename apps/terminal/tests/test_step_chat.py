"""The chat inside a step (built-in replies, never a model), the scope tick list and the
plan's order (store/plan_order.py)."""

import pytest
from textual.widgets import Static

from reconix import store
from reconix.screens import TemplateScreen
from reconix.widgets.step_chat import StepChat
from reconix.widgets.tick_list import TickList

from .support import SIZE, decide, play_until_gate, run_to, settle, start_demo

NETWORK = "Assess 192.0.2.10"


# --- store: the built-in step replies ------------------------------------------------------
@pytest.mark.parametrize("line, decision, question", [
    ("yes", True, False),
    ("apporve that scope", True, False),
    ("should I approve it?", False, True),
    ("what does nmap do", False, False),
])
def test_decision_lines_are_spotted_without_a_model(line, decision, question):
    assert store.wants_decision(line) is decision
    assert store.asks_about_decision(line) is question


def test_view_and_scope_change_lines():
    assert store.wants_view("show me the plan") == "plan"
    assert store.wants_view("scope?") == "scope"
    assert store.wants_view("plan a trip") == ""
    assert store.wants_scope_change("add port 3389")
    assert not store.wants_scope_change("add some coffee")


def test_recorded_line_masks_credentials():
    line = store.recorded_line("try https://bob:hunter2@www.lumina.com")
    assert "hunter2" not in line


def test_scope_change_offers_todays_ports_and_tools_then_locks():
    run_to("scope", NETWORK)
    scope = store.get_scope()
    choices = store.answer_scope_change()
    assert choices is not None
    assert {port for port, ticked in choices.ports if ticked} == set(scope.allowed_ports)
    assert all(ticked for _tool, ticked in choices.tools)
    decide("scope")
    assert store.answer_scope_change() is None
    assert "locked" in store.last_exchange()[1][-1].text


# --- store: the plan's order ---------------------------------------------------------------
def test_a_single_gated_check_cannot_move():
    run_to("plan")
    assert store.movable_checks() == []
    assert store.answer_plan_reorder() is False
    with pytest.raises(store.StoreValidationError):
        store.reorder_gated(["approval-001"])


def test_reordering_moves_the_approvals_and_the_run_with_them():
    run_to("plan", NETWORK)
    assert store.wants_plan_reorder("move 3b before 3a")
    assert store.movable_checks() == ["approval-001", "approval-002"]
    with pytest.raises(store.StoreValidationError):
        store.reorder_gated(["approval-002"])               # each check once
    store.reorder_gated(["approval-002", "approval-001"])
    assert [r.request_id for r in store.get_assessment().approvals] == [
        "approval-002", "approval-001"]
    decide("plan")
    gates = []
    while True:
        gate = play_until_gate()
        if gate is None:
            break
        if gate.startswith("approval:"):
            gates.append(gate)
        decide(gate)
    assert gates == ["approval:approval-002", "approval:approval-001"]
    assert store.is_completed()


def test_thinking_folds_the_steps_between_messages():
    run_to("plan")
    items = store.group_stream(store.stream())
    assert items                                             # messages and folded steps
    assert {type(item).__name__ for item in items} <= {"MessageItem", "ThinkingItem"}


# --- UI: the chat inside a step ------------------------------------------------------------
def chat_text(app) -> str:
    return " ".join(str(w.render()) for w in app.screen.query(StepChat).first().query(Static))


async def test_type_something_opens_the_step_chat_and_esc_brings_the_menu_back(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        await pilot.press("4", *"hello", "enter")           # Type something.
        await settle(pilot)
        assert isinstance(app.screen, TemplateScreen)
        assert app.screen.query(StepChat)
        text = chat_text(app)
        assert "hello" in text and "◆ reconix" in text
        assert app.screen.query(".feedback-echo")
        assert not store.is_scope_approved()                # advice only
        await pilot.press("escape")
        await settle(pilot)
        assert not app.screen.query(StepChat)
        assert app.screen.query_one(".feedback-echo").display


async def test_an_unknown_command_in_the_chat_is_answered_there(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        await pilot.press("4", *"hi", "enter")
        await settle(pilot)
        await pilot.press(*"/nope", "enter")
        await settle(pilot)
        assert 'Unknown command "/nope"' in chat_text(app)


async def test_a_scope_change_line_opens_the_tick_list(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        await pilot.press("4", *"add port 3389", "enter")
        await settle(pilot)
        assert app.screen.query(TickList)
        assert "Only you can change the scope" in chat_text(app)
        await pilot.press("escape")                         # cancel the list
        await settle(pilot)
        assert not app.screen.query(TickList)
        assert "No change to the scope." in chat_text(app)


async def test_arrows_never_leave_an_open_step_chat(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        await pilot.press("4", *"hi", "enter")
        await settle(pilot)
        await pilot.press("left")                            # empty input: passes to the app
        await settle(pilot)
        assert isinstance(app.screen, TemplateScreen)
        assert app.screen.query(StepChat)
