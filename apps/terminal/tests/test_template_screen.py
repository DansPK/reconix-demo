"""The Template screen (formerly Scope): pick + target, the AI's pick, the scope gate."""

import pytest
from textual.widgets import Input, Static

from reconix import store
from reconix.screens import PlanScreen, StartScreen, TemplateScreen
from reconix.screens.forms import ScopeEditForm
from reconix.widgets import PromptBox, ScopeManifestView

from .support import ASK_REQUEST, SIZE, choose_by_keys, event_kinds, run_to, settle, start_demo

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
        assert target.placeholder == "https://shop.lumina.com"
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


async def test_an_ambiguous_target_auto_selects_the_ai_pick(app):
    async with app.run_test(size=SIZE) as pilot:
        app.screen.query_one(PromptBox).input.value = ASK_REQUEST
        await pilot.press("enter")
        await settle(pilot)
        assert isinstance(app.screen, TemplateScreen)
        assert app.screen.state() == "review"          # the pick is skipped; straight to scope
        assert store.selected_template().id == "web_url"


async def test_approve_goes_on_to_the_plan(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        await pilot.press("1")                                      # Approve scope
        await settle(pilot)
        assert isinstance(app.screen, TemplateScreen)               # stops to review the plan
        assert app.screen.state() == "approved"
        assert store.is_scope_approved()
        await pilot.press("1")                                      # Review the test plan
        await settle(pilot)
        assert isinstance(app.screen, PlanScreen)                   # now on the plan
        assert app.screen.state() == "ready"


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


async def test_reject_stops_it_and_stays_on_the_assessment(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        await choose_by_keys(pilot, "reject")   # destructive: no digit picks it
        await settle(pilot)
        assert isinstance(app.screen, TemplateScreen)
        assert app.screen.state() == "stopped"                     # "Start again?"
        assert store.get_run().started and store.get_run().stopped
        assert [c.status for c in store.list_assessments()] == ["Stopped"]   # no new one
        chat = [entry.text for entry in store.get_assessment().chat]
        assert "Scope rejected. Nothing was tested." in chat
        assert "scope.rejected" in event_kinds()


async def test_start_again_after_a_rejected_scope_opens_a_new_assessment(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        await choose_by_keys(pilot, "reject")
        await settle(pilot)
        await choose_by_keys(pilot, "new")
        await settle(pilot)
        assert [c.status for c in store.list_assessments()] == ["Stopped", "New"]


async def test_scope_card_in_the_step_chat_is_the_scope_panel(app):
    from reconix.widgets.manifest import ScopePanel
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        card = app.screen.chat_card()
        assert isinstance(card, ScopePanel)
        assert card.border_subtitle == "draft · needs your approval"


async def test_template_past_the_scope_starts_a_new_assessment(app):
    run_to("approval:approval-001")          # scope approved, testing under way
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


# --- the target field, checked as you type ----------------------------------------------------
@pytest.mark.parametrize("template,value,level", [
    ("network", "10.0.0.0/24", "ok"),
    ("network", "scanme.example.com", "ok"),
    ("network", "metasploitable", "caution"),            # a one-word lab host: allowed, flagged
    ("network", "10.0.0.1 please", "error"),             # one value only, nothing dropped
    ("network", "10.0.0.1-10.0.0.20", "error"),          # a dash range is not its first address
    ("network", "10.0.0.300", "error"),
    ("network", "", "error"),
    ("network", "a" * 250 + ".io", "error"),             # past the hostname limit
    ("network", "http://x]x[", "error"),                 # urlsplit raises on it
    ("web_url", "https://shop.example.com/" + "p" * 500, "error"),
    ("web_url", "https://shop.example.com", "ok"),
    ("web_url", "http://juice-shop:3000", "caution"),
    ("web_url", "http://x]x[", "error"),
    ("web_url", "ftp://shop.example.com", "error"),
    ("source", "https://git.example.com/acme/app.git", "ok"),
    ("source", "git@github.com:acme/app.git", "ok"),
    ("source", "/definitely/not/a/folder", "error"),
])
def test_the_field_check_reads_the_whole_value(template, value, level):
    assert store.check_field(template, value).level == level


def test_an_existing_folder_is_a_source_target(tmp_path):
    (tmp_path / "file.py").write_text("")
    assert store.check_field("source", str(tmp_path)).level == "ok"
    assert "is a file" in store.check_field("source", str(tmp_path / "file.py")).message


@pytest.mark.parametrize("template", ["network", "web_url", "api", "source"])
def test_every_templates_own_example_passes_the_check(template):
    assert store.check_field(template, store.get_template(template).example).level == "ok"


async def test_the_field_says_what_it_reads_as_you_type(app):
    async with app.run_test(size=SIZE) as pilot:
        await open_template(app, pilot, "network")
        target = app.screen.query_one("#target", Input)
        line = app.screen.query_one("#target-error", Static)
        target.value = "10.0.0."
        await settle(pilot)
        assert "keep typing" in str(line.render())            # not an error while typing
        assert not target.has_class("nomatch")
        target.value = "10.0.0.0/24"
        await settle(pilot)
        assert "network range: 10.0.0.0/24" in str(line.render())
        assert target.has_class("match")
        target.value = "lab-box"
        await settle(pilot)
        assert "one-word host name" in str(line.render())
        assert target.has_class("caution") and not target.has_class("match")


async def test_after_enter_errors_turn_red_and_follow_the_typing(app):
    async with app.run_test(size=SIZE) as pilot:
        await open_template(app, pilot, "network")
        target = app.screen.query_one("#target", Input)
        target.value = "10.0.0.1 please"
        await pilot.press("enter")
        await settle(pilot)
        assert not store.get_run().started
        assert "without spaces" in str(app.screen.query_one("#target-error", Static).render())
        assert target.has_class("nomatch")
        target.value = "10.0.0.1"
        await settle(pilot)
        assert target.has_class("match") and not target.has_class("nomatch")


async def test_text_fields_keep_a_steady_cursor(app):
    async with app.run_test(size=SIZE) as pilot:
        await open_template(app, pilot, "network")
        assert app.screen.query_one("#target", Input).cursor_blink is False


async def test_typing_stops_at_the_limit_and_a_counter_shows_near_it(app):
    async with app.run_test(size=SIZE) as pilot:
        await open_template(app, pilot, "network")
        target = app.screen.query_one("#target", Input)
        assert target.max_length == 253
        target.value = "a" * 10
        await settle(pilot)
        assert "/253" not in str(app.screen.query_one("#target-error", Static).render())
        target.value = "a" * 253
        await settle(pilot)
        await pilot.press("b")                               # one more is refused
        await settle(pilot)
        assert len(target.value) == 253
        assert "253/253" in str(app.screen.query_one("#target-error", Static).render())
