"""T3: the Plan screen's rows, its ▤ PLAN card in the step chat, and its states."""

from reconix import store
from reconix.models import PlanRow
from reconix.screens.plan import PlanScreen, status_counts
from reconix.widgets.plan_rows import LABEL_WIDTH, NUM_WIDTH, PlanPanel, plan_line
from reconix.widgets.step_chat import StepChat

from .support import SIZE, run_ui_to, screen_text, settle, wait_until


def test_a_long_plan_row_continues_under_its_own_column():
    row = PlanRow(num="1", label="Crawl & map endpoints",
                  detail="map the permitted surface · OWASP ZAP and more words here",
                  risk="LOW", gate="auto", status="pending")
    width = 70
    lines = plan_line(row, width, full=True).plain.split("\n")
    assert len(lines) >= 3                               # wrapped, then the risk line
    for line in lines[1:-1]:
        assert line.startswith(" " * (NUM_WIDTH + LABEL_WIDTH))
    assert all(len(line) <= width for line in lines)


def test_a_cut_row_ends_in_an_ellipsis_and_missing_values_show_a_dash():
    row = PlanRow(num="2", label="Probe login", detail="x" * 200, risk="", gate="",
                  status="")
    text = plan_line(row, 60).plain
    assert "…" in text and "—" in text and "None" not in text


def test_status_counts_name_done_rejected_and_not_run():
    rows = [PlanRow("1", "a", "", "LOW", "auto", "done"),
            PlanRow("2", "b", "", "LOW", "auto", "rejected"),
            PlanRow("3", "c", "", "LOW", "auto", "pending")]
    assert status_counts(rows) == "1 done · 1 rejected · 1 not run"


async def test_the_plan_gate_shows_the_rows_and_allows_reorder(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "plan")
        screen = app.screen
        assert isinstance(screen, PlanScreen) and screen.state() == "ready"
        assert screen.query_one("#plan-list").option_count == len(store.plan_overview())
        assert screen.allows_reorder()
        assert screen.decision().question == "Run this plan?"


async def test_chat_at_the_plan_prints_the_plan_card(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "plan")
        app.screen.chat_in_step()
        await wait_until(pilot, lambda: bool(app.screen.query(StepChat).first().query(PlanPanel))
                         if app.screen.query(StepChat) else False, what="the plan card")
        text = screen_text(app.screen.query_one(PlanPanel))
        assert store.plan_overview()[0].label in text


async def test_a_finished_plan_lists_its_results(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)
        app.goto("plan")
        await settle(pilot)
        screen = app.screen
        assert isinstance(screen, PlanScreen) and screen.state() == "finished"
        assert not screen.allows_reorder()
        assert "Finished:" in str(screen.query_one("#plan-results").content)
