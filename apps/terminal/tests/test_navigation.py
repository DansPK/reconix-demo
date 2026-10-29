"""Flow navigation: arrows, number jumps, the execution guard, help, the flow line."""

from reconix import store
from reconix.screens import (
    ApprovalScreen, ExecutionScreen, FindingsListScreen, HelpScreen, PlanScreen, ReportScreen,
    StartScreen, TemplateScreen,
)
from reconix.widgets import FlowProgress

from .support import SIZE, run_to, settle, show, start_demo


async def test_app_opens_on_start(app):
    async with app.run_test(size=SIZE) as pilot:
        await settle(pilot)
        assert isinstance(app.screen, StartScreen)
        assert app.flow_order() == ["start", "template", "plan", "approval", "execution",
                                    "findings", "detail", "report"]


async def test_enter_on_empty_prompt_runs_the_demo_to_the_scope(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        assert isinstance(app.screen, TemplateScreen)
        assert app.screen.state() == "review"
        assert store.get_assessment().target == "staging.example.com"


async def test_arrows_walk_the_flow(app):
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "findings")          # no menu has focus here
        await pilot.press("left")
        await settle(pilot)
        assert isinstance(app.screen, ApprovalScreen)
        await pilot.press("left")
        await settle(pilot)
        assert isinstance(app.screen, PlanScreen)


async def test_number_keys_jump_and_right_stops_at_the_end(app):
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "findings")
        await pilot.press("8")
        await settle(pilot)
        assert isinstance(app.screen, ReportScreen)
        await pilot.press("right")
        await settle(pilot)
        assert isinstance(app.screen, ReportScreen)
        await pilot.press("6")
        await settle(pilot)
        assert isinstance(app.screen, FindingsListScreen)


async def test_execution_opens_only_after_the_plan_runs(app):
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "findings")
        await pilot.press("5")
        await settle(pilot)
        assert isinstance(app.screen, FindingsListScreen)     # refused: nothing has run
        run_to("account")
        await pilot.press("5")
        await settle(pilot)
        assert isinstance(app.screen, ExecutionScreen)


async def test_help_toggles_and_blocks_jumps(app):
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "findings")
        await pilot.press("question_mark")
        await settle(pilot)
        assert isinstance(app.screen, HelpScreen)
        await pilot.press("3")                              # jumps are inactive under a modal
        await settle(pilot)
        assert isinstance(app.screen, HelpScreen)
        await pilot.press("question_mark")
        await settle(pilot)
        assert isinstance(app.screen, FindingsListScreen)


async def test_flow_line_marks_the_step_that_waits_for_you(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        line = str(app.screen.query_one(FlowProgress).render())
        assert "✓ Start" in line
        assert "! Template" in line
        assert "○ Plan" in line
