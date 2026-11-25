""" "Type something." at the Scope and Plan steps, driven with the keyboard: a question, a scope
change or a plan change; the operator still approves and runs everything."""

import copy

import pytest

from reconix import store
from reconix.flow import RunController
from reconix.models import ScopeChanges
from reconix.screens.forms import LoginForm
from reconix.store import lists
from reconix.widgets.choice_menu import ChoiceMenu
from reconix.widgets.manifest import ScopePanel
from reconix.widgets.plan_rows import PlanPanel
from reconix.widgets.step_chat import StepChat
from reconix.widgets.tick_list import TickList

from .support import SIZE, TEST_PASSWORD, pass_gate, run_ui_to, screen_text, settle

NETWORK = "Assess 192.0.2.10"
SIZES = pytest.mark.parametrize("size", [(80, 24), (140, 40)])


def menu(app) -> ChoiceMenu:
    return [m for m in app.screen.query(ChoiceMenu) if m.display][-1]


def labels(app) -> list:
    return [choice.label for choice in menu(app)._choices]


async def ready(app, pilot) -> ChoiceMenu:
    """The menu shown, focused and past its stray-key guard."""
    target = menu(app)
    target.focus()
    await pilot.pause(target.ARM_DELAY + 0.1)
    return target


async def type_line(app, pilot, line: str) -> None:
    """Write `line` on the step's "Type something." row and send it."""
    target = await ready(app, pilot)
    target.highlighted = labels(app).index("Type something.")
    await pilot.pause()
    await pilot.press(*["space" if char == " " else char for char in line], "enter")
    await settle(pilot)


def chat_text(app) -> str:
    chat = app.screen.query_one(StepChat)
    return " ".join(" ".join(screen_text(chat).split()).split())


@SIZES
async def test_a_scope_edit_then_approve(app, size):
    async with app.run_test(size=size) as pilot:
        await run_ui_to(app, pilot, "scope")
        await type_line(app, pilot, "add sqlmap and exclude /checkout")
        assert "Scope changed: + sqlmap; + excluded /checkout" in chat_text(app)
        assert app.screen.query_one(StepChat).query(ScopePanel)
        assert not store.is_scope_approved()
        assert "Type something." in labels(app)             # a follow-up can be typed
        await ready(app, pilot)
        await pilot.press("home", "enter")                  # the menu's own Approve
        await settle(pilot)
        assert store.is_scope_approved() and "sqlmap" in store.get_scope().tools
        await pass_gate(app, pilot)                         # Review the test plan
        assert store.waiting_gate() == "plan"


@SIZES
async def test_a_plan_step_scope_edit_needs_approval_and_a_new_plan(app, size):
    async with app.run_test(size=size) as pilot:
        await run_ui_to(app, pilot, "plan")
        await type_line(app, pilot, "remove ffuf")
        assert app.screen.flow_name == "template"
        assert "− ffuf" in str(app.screen.query_one("#scope-change-note").render())
        assert app.scope_change_note is None                # shown once
        assert not store.is_scope_approved() and store.waiting_gate() == "scope"
        await ready(app, pilot)
        await pilot.press("1")
        await settle(pilot)
        await pass_gate(app, pilot)                         # Review the test plan
        assert store.waiting_gate() == "plan" and app.screen.flow_name == "plan"
        assert "ffuf" not in repr([task.tools for task in lists.current().plan])
        assert not store.is_plan_started()


@SIZES
async def test_a_plan_edit_waits_for_run_plan(app, size):
    async with app.run_test(size=size) as pilot:
        await run_ui_to(app, pilot, "plan")
        await type_line(app, pilot, "focus on TLS first")
        assert "Plan re-drafted: testssl.sh first" in chat_text(app)
        assert app.screen.query_one(StepChat).query(PlanPanel)
        assert store.waiting_gate() == "plan" and not store.is_plan_started()


@SIZES
@pytest.mark.parametrize("line, says", [
    ("what does nikto do?", "in this scope"),
    ("time limit 9999 minutes", "was refused"),
    ("blorp the frobnicator", "nothing changed"),
    ("focus on TLS first", "after you approve the scope"),
])
async def test_questions_and_bad_edits_change_nothing(app, size, line, says):
    async with app.run_test(size=size) as pilot:
        await run_ui_to(app, pilot, "scope")
        before = copy.deepcopy(store.get_scope())
        await type_line(app, pilot, line)
        assert says in chat_text(app)
        assert store.get_scope() == before and not store.is_scope_approved()
        assert "Chat about this" in labels(app)


async def test_chat_about_this_stays_a_chat(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "scope", request=NETWORK)
        await type_line(app, pilot, "what does nmap do?")
        chat = app.screen.query_one(StepChat)
        assert chat.ai_edit
        app.screen.post_message(ChoiceMenu.Chosen(await ready(app, pilot), "chat"))
        await settle(pilot)
        assert not chat.ai_edit
        before = copy.deepcopy(store.get_scope())
        chat.input.focus()
        chat.input.value = "add port 3399"
        await pilot.press("enter")
        await settle(pilot)
        assert app.screen.query(TickList)                   # the tick list, never an edit
        assert store.get_scope() == before


async def test_a_secret_typed_is_masked_everywhere(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "scope")
        await type_line(app, pilot, f"exclude https://bob:{TEST_PASSWORD}@www.lumina.com")
        assert app.screen.query(StepChat)
        kept = repr((lists.FEEDBACK, lists.EVENTS, store.list_chat(), store.list_history(),
                     lists.current().requests))
        assert TEST_PASSWORD not in kept and TEST_PASSWORD not in screen_text(app.screen)


async def test_a_stale_reply_never_lands_in_another_assessment(app, monkeypatch):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "scope")
        first = store.get_assessment()
        monkeypatch.setattr(RunController, "SPEED", 0.3)
        app.screen.post_message(ChoiceMenu.Typed(menu(app), "remove ffuf"))
        await pilot.pause(0.1)
        assert "thinking" in chat_text(app).lower()
        monkeypatch.setattr(RunController, "SPEED", 0)
        store.new_assessment()
        store.start_run(NETWORK)
        assert store.get_assessment() is not first
        await pilot.pause(0.6)
        assert "ffuf" in first.scope.tools
        assert "Scope changed" not in repr(store.list_chat())


async def test_the_login_step_refuses_a_typed_line(app, monkeypatch):
    warnings = []
    monkeypatch.setattr(app, "notify", lambda msg, **kw: warnings.append(str(msg)))
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "account",
                        request="test the API at https://api.example.com/v1 with Postman")
        assert isinstance(app.screen, LoginForm)
        flow = app.screen_stack[-2]
        flow.post_message(ChoiceMenu.Typed(ChoiceMenu([]), TEST_PASSWORD))
        await settle(pilot)
        assert any("target login" in warning for warning in warnings)
        with pytest.raises(store.StoreValidationError):
            store.apply_scope_changes(ScopeChanges(add_tools=["sqlmap"]))
        kept = repr((store.list_chat(), lists.FEEDBACK, lists.EVENTS, warnings))
        assert TEST_PASSWORD not in kept
