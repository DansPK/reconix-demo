"""Slash commands typed at the prompt: summary, new, finding, navigation, audit, help."""

from reconix import store
from reconix.screens import (
    ApprovalScreen, ChoiceScreen, ExecutionScreen, FindingDetailScreen, ReportScreen,
    StartScreen,
)
from reconix.widgets import PromptBox

from .support import SIZE, run_ui_to, screen_text, settle


async def command(pilot, line: str) -> None:
    """Type a slash command into the prompt on screen and submit it."""
    box = pilot.app.screen.query_one(PromptBox)
    box.input.value = line
    box.input.focus()
    await pilot.press("enter")
    await settle(pilot)


async def finished_run(app, pilot) -> None:
    await run_ui_to(app, pilot, None)
    app.goto("start")
    await settle(pilot)


# --- /summary ------------------------------------------------------------------------------
async def test_summary_after_a_run_shows_the_findings_line(app):
    async with app.run_test(size=SIZE) as pilot:
        await finished_run(app, pilot)
        await command(pilot, "/summary")
        assert isinstance(app.screen, ChoiceScreen)
        text = screen_text(app.screen)
        assert "RCX-DEMO-001" in text
        summary = store.assessment_summary()
        assert f"{summary.confirmed} confirmed" in text
        assert store.findings_line().startswith("3 findings")


async def test_summary_before_any_run_does_not_crash(app):
    async with app.run_test(size=SIZE) as pilot:
        await command(pilot, "/summary")
        assert isinstance(app.screen, ChoiceScreen)
        await pilot.press("escape")
        await settle(pilot)
        assert isinstance(app.screen, StartScreen)


# --- /new ----------------------------------------------------------------------------------
async def test_new_on_a_target_starts_a_fresh_assessment(app):
    async with app.run_test(size=SIZE) as pilot:
        await finished_run(app, pilot)
        before = len(store.list_assessments())
        old_id = store.get_assessment().planned_id
        await command(pilot, "/new https://shop.example.com")
        assessment = store.get_assessment()
        assert len(store.list_assessments()) == before + 1
        assert assessment.planned_id != old_id
        assert "shop.example.com" in assessment.target
        assert not store.is_finished()


async def test_new_without_a_target_returns_to_an_empty_start(app):
    async with app.run_test(size=SIZE) as pilot:
        await finished_run(app, pilot)
        before = len(store.list_assessments())
        await command(pilot, "/new")
        assert len(store.list_assessments()) == before + 1
        assert isinstance(app.screen, StartScreen)
        assert not store.get_run().started


# --- /finding ------------------------------------------------------------------------------
async def test_finding_before_any_finding_exists_does_not_crash(app):
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/finding")
        await settle(pilot)
        assert isinstance(app.screen, StartScreen)         # told "No findings yet", no menu
        await command(pilot, "/finding 001")
        assert isinstance(app.screen, StartScreen)


async def test_finding_opens_the_detail_of_that_finding(app):
    async with app.run_test(size=SIZE) as pilot:
        await finished_run(app, pilot)
        await command(pilot, "/finding 001")
        assert isinstance(app.screen, FindingDetailScreen)
        assert app.selected_finding == "001"


async def test_unknown_finding_id_does_not_open_a_detail(app):
    async with app.run_test(size=SIZE) as pilot:
        await finished_run(app, pilot)
        await command(pilot, "/finding 999")
        assert not isinstance(app.screen, FindingDetailScreen)
        assert app.selected_finding != "999"
        if isinstance(app.screen, ChoiceScreen):           # asks which finding instead
            await pilot.press("escape")
            await settle(pilot)
        assert isinstance(app.screen, StartScreen)


async def test_typing_finding_exactly_runs_finding_not_findings(app):
    """The suggestion menu puts the exact match `finding` above `findings`."""
    async with app.run_test(size=SIZE) as pilot:
        await finished_run(app, pilot)
        await command(pilot, "/finding")
        assert isinstance(app.screen, ChoiceScreen)        # "Which finding?"


# --- navigation ----------------------------------------------------------------------------
async def test_report_command_opens_the_report(app):
    async with app.run_test(size=SIZE) as pilot:
        await command(pilot, "/report")
        assert isinstance(app.screen, ReportScreen)


async def test_approval_command_opens_the_approval_gate(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "approval:approval-001")
        app.goto("start")
        await settle(pilot)
        await command(pilot, "/approval")
        assert isinstance(app.screen, ApprovalScreen)


async def test_status_command_opens_execution_once_the_plan_ran(app):
    async with app.run_test(size=SIZE) as pilot:
        await finished_run(app, pilot)
        await command(pilot, "/status")
        assert isinstance(app.screen, ExecutionScreen)


# --- dialogs -------------------------------------------------------------------------------
async def test_audit_lists_the_recorded_events(app):
    async with app.run_test(size=SIZE) as pilot:
        await finished_run(app, pilot)
        kinds = [e.kind for e in store.list_events()]
        assert kinds
        await command(pilot, "/audit")
        assert isinstance(app.screen, ChoiceScreen)
        text = screen_text(app.screen)
        assert "Audit trail" in text
        assert kinds[-1] in text


async def test_audit_before_any_action_says_so(app):
    async with app.run_test(size=SIZE) as pilot:
        await command(pilot, "/audit")
        assert isinstance(app.screen, ChoiceScreen)
