"""The Start screen: the logo until the first line, then the conversation and its spinner."""

from reconix import store
from reconix.screens import StartScreen, TemplateScreen
from reconix.widgets import ActivityStatus, PromptBox

from .support import ASK_REQUEST, SIZE, play_until_gate, settle, show


def _reconix_lines() -> list:
    return [e.text for e in store.last_exchange()[1]]


def _play_until_replies(count: int) -> None:
    """Advance the run (no gate yet) until Reconix has said `count` lines since the request."""
    while len(_reconix_lines()) < count:
        store.advance()
    assert not store.waiting_gate()


async def test_the_logo_shows_until_the_first_line(app):
    async with app.run_test(size=SIZE) as pilot:
        await settle(pilot)
        assert app.screen.query("#logo") and app.screen.query("#quickstart")
        app.screen.query_one(PromptBox).input.value = "hello"
        await pilot.press("enter")
        await settle(pilot)
        assert isinstance(app.screen, StartScreen)
        assert not app.screen.query("#logo") and not app.screen.query("#quickstart")
        assert "› hello" in str(app.screen.query_one(".user-msg").render())
        assert "Hi!" in str(app.screen.query_one("#start-reply").render())
        assert not app.screen.query_one("#start-activity").display     # answered, not working


async def test_a_new_assessment_brings_the_logo_back(app):
    async with app.run_test(size=SIZE) as pilot:
        app.screen.query_one(PromptBox).input.value = "hello"
        await pilot.press("enter")
        await settle(pilot)
        app.new_assessment()
        await settle(pilot)
        assert isinstance(app.screen, StartScreen) and app.screen.query("#logo")


async def test_working_shows_the_request_on_top_and_one_spinner_line(app):
    store.start_run(store.DEMO_REQUEST)
    _play_until_replies(2)
    first, current = _reconix_lines()
    async with app.run_test(size=SIZE) as pilot:
        await settle(pilot)
        assert not app.screen.query("#logo")
        assert store.DEMO_REQUEST in str(app.screen.query_one(".user-msg").render())
        status = app.screen.query_one("#start-activity", ActivityStatus)
        assert status.display and not app.screen.query_one("#start-reply").display
        shown = str(status.render())
        assert current in shown and first not in shown and "ctrl+o to expand" in shown
        assert app.screen.query_one(PromptBox).locked                  # Enter can't re-send


async def test_ctrl_o_lists_the_finished_steps_and_hides_them_again(app):
    store.start_run(store.DEMO_REQUEST)
    _play_until_replies(2)
    first, current = _reconix_lines()
    async with app.run_test(size=SIZE) as pilot:
        await settle(pilot)
        status = app.screen.query_one("#start-activity", ActivityStatus)
        await pilot.press("ctrl+o")
        shown = str(status.render())
        assert first in shown and current in shown and "ctrl+o to collapse" in shown
        await pilot.press("ctrl+o")
        assert first not in str(status.render())


async def test_the_template_screen_spinner_keeps_the_expanded_choice(app):
    store.start_run(ASK_REQUEST)
    assert play_until_gate() == "template"
    store.select_template(store.get_assessment().template_id)        # now drafting the scope
    async with app.run_test(size=SIZE) as pilot:
        await pilot.press("ctrl+o")
        await show(app, pilot, "template")
        assert isinstance(app.screen, TemplateScreen) and TemplateScreen.state() == "busy"
        status = app.screen.query_one("#template-activity", ActivityStatus)
        lines = _reconix_lines()
        shown = str(status.render())
        assert all(line in shown for line in lines)
        if len(lines) > 1:
            assert "ctrl+o to collapse" in shown
