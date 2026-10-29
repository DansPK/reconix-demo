"""The non-demo templates (api, network, source) driven through the UI to the report."""

from pathlib import Path

import pytest
from textual.widgets import DataTable

from reconix import store
from reconix.screens import ChoiceScreen, FindingsListScreen, ReportScreen
from reconix.screens.forms import LoginForm

from .support import SIZE, TEST_PASSWORD, pass_gate, run_ui_to, settle

# (request, template, has a login, where finding 001 is)
CASES = [
    pytest.param("test the API at https://api.example.com/v1", "api", True,
                 "/v1/orders/{id}", id="api"),
    pytest.param("Assess 192.0.2.10", "network", False, "192.0.2.10:8443/manager",
                 id="network-host"),
    pytest.param("Assess 10.0.0.0/24", "network", False, "10.0.0.1:8443/manager",
                 id="network-cidr"),     # a range: the findings are on one of its hosts
    pytest.param("Review https://git.example.com/acme/app.git", "source", False,
                 "app/config/settings.py", id="source"),
]


@pytest.mark.parametrize("request_text, template_id, has_login, first_path", CASES)
async def test_template_runs_through_the_ui_to_an_exported_report(
        app, request_text, template_id, has_login, first_path):
    login_screens = []
    async with app.run_test(size=SIZE) as pilot:
        # Stop at the first login (if the template has one), then pass every gate.
        await run_ui_to(app, pilot, "account" if has_login else None, request=request_text)
        assert store.get_assessment().template_id == template_id
        while not store.is_finished():
            if isinstance(app.screen, LoginForm):
                login_screens.append(store.current_auth_challenge())
            await pass_gate(app, pilot)

        assert store.is_finished()
        if has_login:
            assert login_screens, "the cookie login form never appeared"
            assert all(c.kind != "otp" for c in login_screens)   # no one-time code step
        else:
            assert not login_screens
        findings = store.list_findings()
        assert len(findings) == 3

        app.goto("findings")
        await settle(pilot)
        assert isinstance(app.screen, FindingsListScreen)
        assert app.screen.query_one(DataTable).row_count == 3

        await pilot.press("8")
        await settle(pilot)
        assert isinstance(app.screen, ReportScreen)
        await pilot.press("j")
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen)
        path = Path(store.get_run().report_path)
        assert path.suffix == ".json" and path.exists()
        assert TEST_PASSWORD not in path.read_text(encoding="utf-8")

    assert store.get_finding("001").path == first_path
