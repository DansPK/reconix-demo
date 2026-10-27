"""The Template screen (formerly Scope): pick + target, the AI's pick, the scope gate."""

from textual.widgets import Input, Static

from reconix import store
from reconix.screens import PlanScreen, StartScreen, TemplateScreen
from reconix.screens.forms import ScopeEditForm
from reconix.widgets import PromptBox, ScopeManifestView

from .support import ASK_REQUEST, SIZE, event_kinds, run_to, settle, start_demo

WEB_URL = 4      # the catalog order: Network, API, Source Code, Web URL


async def open_template(app, pilot, arg: str = "") -> None:
    app.run_command_line(f"/template {arg}".strip())
    await settle(pilot)
    assert isinstance(app.screen, TemplateScreen)


async def test_pick_a_template_then_type_its_target(app):
    async with app.run_test(size=SIZE) as pilot:
        await open_template(app, pilot)
        assert app.screen.state() == "pick"
        await pilot.press(str(WEB_URL))
        await settle(pilot)
        target = app.screen.query_one("#target", Input)
        assert target.has_focus
        assert target.placeholder == "https://shop.example.com"
        target.value = "https://staging.example.com"
        await pilot.press("enter")
        await settle(pilot)
        assert app.screen.state() == "review"
        assert store.selected_template().id == "web_url"
        assert not store.get_assessment().template_auto            # picked, not matched


async def test_a_target_that_does_not_fit_stays_with_an_error(app):
    async with app.run_test(size=SIZE) as pilot:
        await open_template(app, pilot, "network")                  # preset: target first
        target = app.screen.query_one("#target", Input)
        assert target.has_focus
        target.value = "10.0.0.300"
        await pilot.press("enter")
        await settle(pilot)
        assert app.screen.state() == "pick"
        assert not store.get_run().started
        assert str(app.screen.query_one("#target-error", Static).render())


async def test_esc_in_the_target_goes_back_to_the_templates(app):
    async with app.run_test(size=SIZE) as pilot:
        await open_template(app, pilot, "api")
        await pilot.press("escape")
        await settle(pilot)
        assert not app.screen.query_one("#target-row").display
        assert app.screen.focused.id == "template-menu"


async def test_an_ambiguous_target_asks_with_the_ai_pick_recommended(app):
    async with app.run_test(size=SIZE) as pilot:
        app.screen.query_one(PromptBox).input.value = ASK_REQUEST
        await pilot.press("enter")
        await settle(pilot)
        assert isinstance(app.screen, TemplateScreen)
        assert app.screen.state() == "choose"
        menu = app.screen.focused
        assert "(Recommended)" in str(menu.get_option_at_index(menu.highlighted).prompt)
        await pilot.press("enter")
        await settle(pilot)
        assert app.screen.state() == "review"


async def test_approve_goes_on_to_the_plan(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        await pilot.press("1")                                      # Approve scope
        await settle(pilot)
        assert isinstance(app.screen, PlanScreen)
        assert app.screen.state() == "ready"
        assert store.is_scope_approved()
        app.goto("template")
        await settle(pilot)
        assert app.screen.state() == "approved"


async def test_edit_manifest_saves_through_the_store(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        await pilot.press("2")                                      # Edit manifest
        await settle(pilot)
        assert isinstance(app.screen, ScopeEditForm)
        app.screen.query_one("#methods", Input).value = "GET"
        app.screen.query_one("#time-limit", Input).value = "45"
        app.screen.query_one("#submit").press()
        await settle(pilot)
        assert isinstance(app.screen, TemplateScreen)
        assert store.get_scope().allowed_methods == ["GET"]
        assert store.get_scope().time_limit_minutes == 45
        shown = str(app.screen.query_one(ScopeManifestView).render())
        assert "Send only GET requests" in shown
        assert "45" not in shown and "minutes" not in shown     # the time limit isn't shown


async def test_a_bad_edit_shows_the_store_error_and_changes_nothing(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        await pilot.press("2")
        await settle(pilot)
        app.screen.query_one("#time-limit", Input).value = "9999"
        app.screen.query_one("#submit").press()
        await settle(pilot)
        assert isinstance(app.screen, ScopeEditForm)
        assert "time limit" in str(app.screen.query_one("#form-error", Static).render())
        assert store.get_scope().time_limit_minutes == 30


async def test_reject_stops_it_and_starts_fresh(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        await pilot.press("3")                                      # Reject
        await settle(pilot)
        assert isinstance(app.screen, StartScreen)
        assert not store.get_run().started
        cards = store.list_assessments()
        assert [c.status for c in cards] == ["Stopped", "New"]
        assert "scope.rejected" in event_kinds()


async def test_template_past_the_scope_starts_a_new_assessment(app):
    run_to("account")
    async with app.run_test(size=SIZE) as pilot:
        await open_template(app, pilot)
        assert app.screen.state() == "pick"
        assert len(store.list_assessments()) == 2
        assert store.list_assessments()[0].status == "Awaiting input"


async def test_template_during_the_scope_review_shows_it(app):
    run_to("scope")
    async with app.run_test(size=SIZE) as pilot:
        await open_template(app, pilot)
        assert app.screen.state() == "review"
        assert len(store.list_assessments()) == 1
