"""Claude-Code-style questions ("Type something.", "Chat about this"), help, and the Start
screen layout."""

import pytest
from textual.widgets import Static

from reconix import store
from reconix.app import ReconixApp
from reconix.screens import ApprovalScreen, HelpScreen, StartScreen, TemplateScreen
from reconix.widgets import ChoiceMenu, PromptBox

from .support import SIZE, event_kinds, run_ui_to, settle, start_demo


def prompt_text(menu: ChoiceMenu, index: int) -> str:
    return str(menu.get_option_at_index(index).prompt)


async def test_choices_are_numbered_with_descriptions_and_extras(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        menu = app.focused
        assert isinstance(menu, ChoiceMenu)
        first = prompt_text(menu, 0)
        assert first.startswith("❯ 1. Approve scope (Recommended)")
        assert "\n" in first                                     # description on its own line
        labels = [prompt_text(menu, i) for i in range(menu.option_count)]
        assert labels[-2].strip().startswith("4. Type something.")
        assert labels[-1].strip().startswith("5. Chat about this")


async def test_type_something_saves_feedback_and_stays(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        await pilot.press("4", "s", "k", "i", "p", "space", "/", "a", "enter")
        await settle(pilot)
        assert isinstance(app.screen, TemplateScreen)
        [feedback] = store.list_feedback()
        assert (feedback.gate, feedback.text) == ("template", "skip /a")
        assert not store.is_scope_approved()


async def test_typing_never_triggers_screen_shortcuts(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "approval:approval-001")
        await pilot.press("5", "d", "y", "1")                    # typed, not run
        await settle(pilot)
        assert isinstance(app.screen, ApprovalScreen)
        assert store.list_approval_decisions() == []
        assert "dy1" in prompt_text(app.focused, 4)


async def test_chat_about_this_opens_the_prompt_with_context(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "approval:approval-001")
        await pilot.press("6")                                   # Chat about this
        await settle(pilot)
        assert isinstance(app.screen, StartScreen)
        box = app.screen.query_one(PromptBox)
        assert box.input.value == ("About Baseline request (read-only) on "
                                   "staging.example.com: ")
        assert "approval.chat" in event_kinds()


async def test_sent_message_has_a_background_bar(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        message = app.screen.query_one(".user-msg")
        body = app.screen.query_one("#body")
        assert message.styles.background != body.styles.background


async def test_help_lists_the_keys_of_this_screen(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "approval:approval-001")
        await pilot.press("question_mark")
        await settle(pilot)
        assert isinstance(app.screen, HelpScreen)
        assert "APPROVAL" in app.screen.query_one("#help-box").border_title
        text = " ".join(str(w.render()) for w in app.screen.query(Static))
        for phrase in ("pick a numbered choice", "details", "decide later",
                       "jump to a screen"):
            assert phrase in text


@pytest.mark.parametrize("size", [(200, 50), (140, 45), (80, 24)])
async def test_logo_and_steps_panel_are_centred(size):
    app = ReconixApp()
    async with app.run_test(size=size) as pilot:
        await pilot.pause()
        area = app.screen.query_one("#start-center").region
        for selector in ("#logo", "#quickstart"):
            region = app.screen.query_one(selector).region
            left, right = region.x - area.x, area.right - region.right
            assert abs(left - right) <= 1, f"{selector} is off-centre at {size}"


async def test_quickstart_steps_fit_on_one_line_each(app):
    async with app.run_test(size=(200, 50)) as pilot:
        await pilot.pause()
        steps = app.screen.query_one("#quickstart").query("Static").first()
        assert steps.region.height == 3
