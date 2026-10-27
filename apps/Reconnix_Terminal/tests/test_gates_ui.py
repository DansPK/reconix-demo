"""Every gate through the screens: run the plan, the target login, MEDIUM / HIGH approvals,
reject, stop, and pausing (nothing runs until you decide)."""

from rich.text import Text
from textual.widgets import Input, Static

from reconix import store
from reconix.screens import ApprovalScreen, ChoiceScreen, ExecutionScreen, PlanScreen
from reconix.screens.forms import LoginForm
from reconix.widgets import RunLog

from .support import (
    SIZE, TEST_PASSWORD, auth_values, event_kinds, pass_gate, run_ui_to, settle,
)


def screen_text(app) -> str:
    return " ".join(str(w.render()) for w in app.screen.query(Static))


async def test_run_plan_starts_testing_and_opens_execution(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "plan")
        assert isinstance(app.screen, PlanScreen)
        assert store.phase_progress()["discovery"] == 0
        await pilot.press("1")                                  # Run plan
        await settle(pilot)
        assert store.is_plan_started()
        assert store.phase_progress()["discovery"] == 100
        assert isinstance(app.screen, LoginForm)                # the run needs the login


async def test_the_login_form_saves_and_clears_its_secrets(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "account")
        form = app.screen
        assert isinstance(form, LoginForm)
        assert form.query_one("#secret", Input).password          # masked
        assert not form.query("#code")                             # no code with the password
        for field_id, value in auth_values(store.current_auth_challenge()).items():
            form.query_one(f"#{field_id}", Input).value = value
        inputs = list(form.query(Input))
        form.query_one("#submit").press()
        await settle(pilot)
        assert store.is_authenticated()
        assert all(widget.value == "" for widget in inputs)       # cleared on close
        assert store.waiting_gate() == "code"
        assert isinstance(app.screen, LoginForm)                   # then the code, on its own
        assert [w.id for w in app.screen.query(Input)] == ["code"]
        assert TEST_PASSWORD not in screen_text(app)


async def test_the_code_form_asks_only_for_the_code_then_plays_on(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "code")
        assert isinstance(app.screen, LoginForm)
        app.screen.query_one("#code", Input).value = "123456"
        app.screen.query_one("#submit").press()
        await settle(pilot)
        assert store.is_code_verified()
        assert isinstance(app.screen, ApprovalScreen)             # played on to MEDIUM


async def test_a_wrong_code_keeps_the_form_open(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "code")
        app.screen.query_one("#code", Input).value = "12ab"
        app.screen.query_one("#submit").press()
        await settle(pilot)
        assert isinstance(app.screen, LoginForm)
        assert "6 digits" in str(app.screen.query_one("#form-error", Static).render())
        assert not store.is_code_verified()


async def test_cancelled_login_pauses_and_enter_on_execution_reopens_it(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "account")
        await pilot.press("escape")
        await settle(pilot)
        assert isinstance(app.screen, ExecutionScreen)
        assert store.waiting_gate() == "account"
        assert "target login" in str(app.screen.query_one("#exec-hint", Static).render())
        await pilot.press("enter")
        await settle(pilot)
        assert isinstance(app.screen, LoginForm)


async def test_medium_approval_runs_the_one_request(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "approval:approval-001")
        assert isinstance(app.screen, ApprovalScreen)
        assert app.focused.highlighted_id == "details"           # a stray Enter is harmless
        await pilot.press("1")                                   # Approve & run
        await settle(pilot)
        assert store.is_approved("approval-001")
        assert store.waiting_gate() == "approval:approval-002"
        assert isinstance(app.screen, ApprovalScreen)


async def test_high_asks_for_no_reason_only_a_double_check(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "approval:approval-002")
        assert not app.screen.query(Input)                       # nothing to type
        assert app.focused.highlighted_id == "details"           # a stray Enter is harmless
        await pilot.press("1")                                   # Approve & run
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen)              # the double check
        assert "approval.confirmation_requested" in event_kinds()
        assert not store.is_approved("approval-002")


async def test_high_confirmation_defaults_to_no_and_voids_the_token(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "approval:approval-002")
        await pilot.press("1")
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen)
        await pilot.press("2")                                   # digits do nothing here
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen)
        await pilot.press("enter")                               # "No, go back"
        await settle(pilot)
        assert isinstance(app.screen, ApprovalScreen)
        assert not store.is_approved("approval-002")
        assert "approval.confirmation_declined" in event_kinds()


async def test_high_double_checked_with_yes_completes_the_run(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "approval:approval-002")
        await pass_gate(app, pilot)
        assert store.is_completed()
        decision = store.decision_for("approval-002")
        assert decision.decision == "APPROVED" and decision.reason == ""
        assert isinstance(app.screen, ExecutionScreen)
        assert "assessment complete" in str(app.screen.query_one("#exec-hint", Static).render())


async def test_reject_stops_the_run(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "approval:approval-001")
        await pilot.press("2")                                   # Reject
        await settle(pilot)
        assert isinstance(app.screen, ExecutionScreen)
        assert store.is_finished() and not store.is_completed()
        assert "stopped" in str(app.screen.query_one("#exec-hint", Static).render())


async def test_esc_on_an_approval_decides_later(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "approval:approval-001")
        await pilot.press("escape")
        await settle(pilot)
        assert isinstance(app.screen, ExecutionScreen)
        assert store.waiting_gate() == "approval:approval-001"
        assert store.decision_for("approval-001") is None
        await pilot.press("enter")                               # back to the decision
        await settle(pilot)
        assert isinstance(app.screen, ApprovalScreen)


async def test_ctrl_c_asks_then_stops(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "approval:approval-001")
        await pilot.press("escape")
        await settle(pilot)
        await pilot.press("ctrl+c")
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen)
        await pilot.press("enter")                               # "Keep running" is first
        await settle(pilot)
        assert not store.is_finished()
        await pilot.press("ctrl+c")
        await settle(pilot)
        await pilot.press("down", "enter")                       # Stop now
        await settle(pilot)
        assert store.get_run().stopped == "you stopped it"


async def test_execution_streams_the_run(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)
        app.goto("execution")
        await settle(pilot)
        log = app.screen.query_one(RunLog)
        lines = [str(line.text) for line in log.lines]
        text = "\n".join(lines)
        assert any("  policy   Blocked:" in line for line in lines)
        assert "Assessment completed" in text
        assert TEST_PASSWORD not in text


async def test_approval_without_a_waiting_action_lists_the_decisions(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)
        app.goto("approval")
        await settle(pilot)
        text = screen_text(app)
        assert "no action is waiting" in text
        assert text.count("✓ approved") == 2


async def test_scope_text_with_markup_is_shown_literally(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "scope")
        store.edit_scope(tools=["[/oops] ZAP", "[bold]x"])
        await pass_gate(app, pilot)                             # approve
        await pass_gate(app, pilot)                             # run the plan
        await pilot.press("escape")                             # leave the login for later
        await settle(pilot)
        assert isinstance(app.screen, ExecutionScreen)
        subtitle = app.screen.query_one(RunLog).border_subtitle     # stored escaped
        assert "[/oops] ZAP, [bold]x" in Text.from_markup(subtitle).plain
