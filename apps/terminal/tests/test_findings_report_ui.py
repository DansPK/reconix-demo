"""Findings (filter, sort, triage), the detail view, and the report: exports."""


import pytest
from textual.widgets import Button, DataTable, Static

from reconix import store
from reconix.models.scope import PolicyVerdict
from reconix.store import lists, report, report_docx
from reconix.screens import (
    ChoiceScreen, FindingDetailScreen, FindingsListScreen, ReportScreen,
)

from .support import SIZE, add_finding, run_to, run_ui_to, screen_text, settle, show

def row_ids(app) -> list:
    table = app.screen.query_one("#findings-table", DataTable)
    return [table.coordinate_to_cell_key((i, 0)).row_key.value for i in range(table.row_count)]


async def test_findings_appear_as_the_run_reveals_them(app):
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "findings")
        assert not app.screen.query_one("#findings-table").display     # none yet
        empty = str(app.screen.query_one("#findings-empty", Static).render())
        assert "No findings yet" in empty and "import" not in empty.lower()
        run_to(None)
        app.refresh_view()
        await settle(pilot)
        assert row_ids(app) == ["004", "005", "001", "002", "003"]


async def test_filter_and_sort(app):
    run_to(None)
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "findings")
        await pilot.press("f")
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen)
        await pilot.press("down", "down", "enter")                     # Medium
        await settle(pilot)
        assert row_ids(app) == ["001", "002"]
        app.findings_filter = "all"
        await pilot.press("s")                                         # severity → validation
        await settle(pilot)
        assert app.findings_sort == "validation"
        assert row_ids(app) == ["004", "001", "005", "002", "003"]
        await pilot.press("s")                                         # and back
        await settle(pilot)
        assert app.findings_sort == "severity"


async def test_the_findings_screen_has_no_import_key_or_hint(app):
    run_to(None)
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "findings")
        assert "i" not in {b.key for b in app.screen.BINDINGS}
        assert "import" not in screen_text(app.screen).lower()


async def test_triage_from_the_list_and_the_detail(app):
    run_to(None)
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "findings")
        await pilot.press("down", "t")                                 # 005 (2nd row)
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen)
        await pilot.press("4")                                         # False positive
        await settle(pilot)
        assert store.get_finding("005").status == "false-positive"
        assert isinstance(app.screen, FindingsListScreen)
        await pilot.press("enter")                                     # open 005
        await settle(pilot)
        assert isinstance(app.screen, FindingDetailScreen)
        assert app.selected_finding == "005"
        await pilot.press("t")
        await settle(pilot)
        await pilot.press("2")                                         # Fixed
        await settle(pilot)
        assert store.get_finding("005").status == "fixed"
        assert isinstance(app.screen, FindingDetailScreen)


async def test_detail_steps_through_the_list_order(app):
    run_to(None)
    async with app.run_test(size=SIZE) as pilot:
        app.open_finding("004")                                        # top of the list
        await settle(pilot)
        await pilot.press("right_square_bracket")
        await settle(pilot)
        assert app.selected_finding == "005"
        await pilot.press("left_square_bracket", "left_square_bracket")
        await settle(pilot)
        assert app.selected_finding == "004"                           # no wrap-around
        await pilot.press("left")
        await settle(pilot)
        assert isinstance(app.screen, FindingsListScreen)


async def test_detail_without_a_finding_says_so(app):
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "detail")
        assert "no finding selected" in str(app.screen.query_one("#breadcrumb").render())


# --- the report ----------------------------------------------------------------------------
async def test_exports_wait_for_a_completed_assessment(app):
    run_to("approval:approval-001")
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "report")
        assert all(app.screen.query_one(f"#{fid}", Button).disabled
                   for fid in ("pdf", "json", "docx"))
        await pilot.press("j")
        await settle(pilot)
        assert store.get_run().report_path == ""


async def test_the_report_offers_pdf_json_and_docx_only(app):
    run_to(None)
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "report")
        ids = [b.id for b in app.screen.query(".actions Button")]
        assert ids == ["pdf", "json", "docx"]


async def test_export_json_then_open_it(app, opened):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, None)
        await show(app, pilot, "report")
        await pilot.press("j")
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen)
        path = store.get_run().report_path
        assert path.endswith("RCX-001.json")
        await pilot.press("enter")                                     # Open it
        await settle(pilot)
        assert opened == [path]
        assert isinstance(app.screen, ReportScreen)
        assert "report saved" in " ".join(str(w.render()) for w in app.screen.query(Static))


async def test_export_command_offers_pdf_json_and_docx(app):
    run_to(None)
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "report")
        app.run_command_line("/export")
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen)
        ids = [o.id for o in app.screen.query_one("#dialog-menu").options]
        assert ids == ["pdf", "json", "docx"]
        await pilot.press("escape")
        await settle(pilot)
        app.run_command_line("/export json")
        await settle(pilot)
        assert store.get_run().report_path.endswith(".json")


def _control_characters_in_the_run(tmp_path) -> None:
    """An agent finding and a blocked request holding ESC and NUL bytes."""
    add_finding("Banner \u001b[31mred\u0000", "/", evidence=["Server: \u001b[2Jnginx\u0000"])
    lists.current().verdicts.append(PolicyVerdict("GET", "/x\x00", False, "outside \x1b[1m"))


@pytest.mark.skipif(not report.HAS_DOCX, reason="python-docx not installed")
async def test_docx_export_with_control_characters_keeps_the_app_running(app, tmp_path):
    run_to(None)
    _control_characters_in_the_run(tmp_path)
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "report")
        await pilot.press("w")
        await settle(pilot)
        assert app.is_running
        assert isinstance(app.screen, ChoiceScreen)                    # ✓ REPORT SAVED
        assert store.get_run().report_path.endswith("RCX-001.docx")


@pytest.mark.skipif(not report.HAS_DOCX, reason="python-docx not installed")
async def test_a_docx_the_writer_refuses_is_a_warning_not_a_crash(app, monkeypatch):
    def refuse(_data, _path):
        raise ValueError("All strings must be XML compatible")

    run_to(None)
    monkeypatch.setattr(report_docx, "_build", refuse)
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "report")
        await pilot.press("w")
        await settle(pilot)
        assert app.is_running and isinstance(app.screen, ReportScreen)
        assert store.get_run().report_path == ""
        assert any("couldn't be written" in str(n.message) for n in app._notifications)


async def test_web_opens_the_running_dashboard(app, opened, web_launches, monkeypatch):
    from reconix import web_server

    monkeypatch.setattr(web_server, "is_listening", lambda url: True)
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/web")
        await settle(pilot)
        assert opened == ["http://127.0.0.1:3100/"]      # the tokenless static-demo dashboard
        app.run_command_line("/dashboard")
        await settle(pilot)
        assert len(opened) == 2 and web_launches == []


async def test_web_without_a_running_dashboard_starts_it(app, opened, web_launches):
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/web")
        await settle(pilot)
        assert len(web_launches) == 1                 # npm run dev, in the background
        assert opened == []                           # the dashboard opens the browser itself
        assert any("Starting the web dashboard" in str(n.message)
                   for n in app._notifications)


async def test_the_report_has_no_web_button_or_key(app):
    run_to(None)
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "report")
        assert not app.screen.query("#web")
        assert "b" not in {b.key for b in app.screen.BINDINGS}


def test_web_only_opens_a_loopback_url():
    # The static-demo dashboard URL is always loopback; /web never opens anything else.
    assert store.web_dashboard_url().startswith("http://127.0.0.1:")
