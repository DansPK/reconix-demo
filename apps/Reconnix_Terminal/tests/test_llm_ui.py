"""Flexible LLM: the /provider menu, the provider form and the status bar (Pilot)."""

from textual.widgets import Input

from reconix import store
from reconix.screens import ChoiceScreen
from reconix.screens.forms import ProviderForm
from reconix.widgets.chrome import SessionBar

from .support import SIZE, settle


def _bar_text(app) -> str:
    bar = app.screen.query_one(SessionBar)
    bar.refresh_line()
    return str(bar.render())


async def test_provider_command_opens_the_menu(app):
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/provider")
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen)
        ids = [c.id for c in app.screen._choices]
        assert ids[0] == "reconix" and "openai" in ids


async def test_provider_form_saves_through_the_store(app):
    async with app.run_test(size=SIZE) as pilot:
        app.open_provider_form("openai")
        await settle(pilot)
        assert isinstance(app.screen, ProviderForm)
        # A cloud provider's form is key-only: no base URL or models field.
        assert not app.screen.query("#base_url") and not app.screen.query("#models")
        app.screen.query_one("#api_key", Input).value = "sk-test-key-9999"
        app.screen.query_one("#submit").press()
        await settle(pilot)
        view = store.get_provider("openai")
        assert view.configured and view.models == ("gpt-4o-mini", "gpt-4o")   # built-in


async def test_status_bar_shows_active_model(app, reachable):
    async with app.run_test(size=SIZE) as pilot:
        await settle(pilot)
        assert "off" in _bar_text(app)                 # nothing active yet
        store.set_provider("openai", api_key="sk-x-1234", models=["gpt-4o-mini"])
        store.test_provider("openai")
        store.activate("openai", "gpt-4o-mini")
        text = _bar_text(app)
        assert "OpenAI" in text and "gpt-4o-mini" in text


async def test_unset_dialog_defaults_to_keep(app, reachable):
    store.set_provider("ollama", models=["llama3.1"])
    async with app.run_test(size=SIZE) as pilot:
        app.confirm_unset("ollama")
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen)
        await pilot.press("enter")                      # the default is "No, keep it"
        await settle(pilot)
        assert store.get_provider("ollama").configured   # still there
