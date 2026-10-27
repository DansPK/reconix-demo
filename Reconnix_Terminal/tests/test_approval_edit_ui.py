"""Edit params on the Approval screen and Edit steps on the Plan screen, with the keyboard."""

import pytest
from textual.widgets import Input

from reconix import store
from reconix.screens import ApprovalScreen, ChoiceScreen, PlanScreen
from reconix.screens.forms import ApprovalEditForm

from .support import SIZE, pass_gate, run_ui_to, screen_text, settle

EDITS = [
    pytest.param(None, "/api/orders/10490", id="web_url"),
    pytest.param("test the API at https://api.example.com/v1", "/v1/orders/9000", id="api"),
    pytest.param("Assess 10.0.0.0/24", "10.0.0.9:443", id="network"),
    pytest.param("review repo https://git.example.com/acme/app.git", "app/config/local.py",
                 id="source"),
]


async def fill_and_submit(app, pilot, value: str) -> None:
    form = app.screen
    assert isinstance(form, ApprovalEditForm)
    form.query_one("#param", Input).value = value
    form.query_one("#submit").press()
    await settle(pilot)


@pytest.mark.parametrize("request_text, value", EDITS)
async def test_edit_params_rebuilds_the_request_shown(app, request_text, value):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "approval:approval-001", request=request_text)
        assert isinstance(app.screen, ApprovalScreen)
        await pilot.press("4")                                   # Edit params
        await settle(pilot)
        await fill_and_submit(app, pilot, value)
        assert isinstance(app.screen, ApprovalScreen)
        request = store.get_approval("approval-001")
        assert request.path == value
        assert request.command in screen_text(app.screen)        # the new exact request
        await pass_gate(app, pilot)                              # approve what is shown
        assert store.is_approved("approval-001")


async def test_a_refused_value_keeps_the_form_open_with_the_reason(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "approval:approval-001")
        before = store.get_approval("approval-001").command_hash
        await pilot.press("4")
        await settle(pilot)
        await fill_and_submit(app, pilot, "/admin/users")
        assert isinstance(app.screen, ApprovalEditForm)
        assert "Blocked by policy" in screen_text(app.screen)
        assert store.get_approval("approval-001").command_hash == before
        await pilot.press("escape")
        await settle(pilot)
        assert isinstance(app.screen, ApprovalScreen)


async def test_a_high_action_edited_is_still_double_checked(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "approval:approval-002")
        await pilot.press("4")
        await settle(pilot)
        await fill_and_submit(app, pilot, "/api/orders/10499")
        edited = store.get_approval("approval-002")
        assert edited.risk == "HIGH"
        await pilot.press("1")                                   # Approve & run
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen)              # the second confirmation
        assert edited.command in screen_text(app.screen)
        await pilot.press("down", "enter")                       # Yes (No is the default)
        await settle(pilot)
        decision = store.decision_for("approval-002")
        assert decision.decision == "APPROVED"
        assert decision.command_hash == edited.command_hash


async def test_edit_steps_on_the_plan_changes_a_later_gate(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "plan")
        assert isinstance(app.screen, PlanScreen)
        await pilot.press("2")                                   # Edit steps
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen)              # which step?
        await pilot.press("2")                                   # the HIGH one
        await settle(pilot)
        await fill_and_submit(app, pilot, "/api/orders/10499")
        assert isinstance(app.screen, PlanScreen)
        assert store.get_approval("approval-002").path == "/api/orders/10499"
        assert store.get_approval("approval-001").path == "/api/orders/10482"   # untouched
