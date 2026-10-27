"""Agent mode: a credential request pops the secure-input modal and returns values.

`agent_run.run` is mocked to call `on_ask` like the harness would; no backend/LLM/VM.
"""

import pytest
from textual.widgets import Input

from reconix.screens import ChoiceScreen
from reconix.screens.forms import CredentialForm
from reconix.store import agent_run

from .support import SIZE, settle, wait_until


@pytest.fixture
def asking_agent(monkeypatch):
    """Fake agent run that asks for credentials and records what it got back."""
    got = {}

    async def fake_run(text, on_event, on_ask=None):
        got["vals"] = await on_ask({
            "reason": "Login needed to test authenticated endpoints.",
            "fields": ["login_url", "username", "password"],
            "login_url": "http://t/login",
        })

    monkeypatch.setattr(agent_run, "run", fake_run)
    return got


async def test_credential_modal_returns_values(app, model_active, asking_agent):
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/assess http://target.example")
        await wait_until(pilot, lambda: app.agent_mode, what="agent mode")
        await settle(pilot)                            # the Template frame mounts
        app.approve_scope()                            # hand off to the agent
        await wait_until(pilot, lambda: isinstance(app.screen, CredentialForm),
                         what="the credential form")
        assert isinstance(app.screen, CredentialForm)
        assert app.screen.query_one("#login_url", Input).value == "http://t/login"  # prefilled
        app.screen.query_one("#username", Input).value = "alice"
        app.screen.query_one("#password", Input).value = "s3cret"
        app.screen.query_one("#submit").press()
        await wait_until(pilot, lambda: "vals" in asking_agent, what="the agent's credentials")
        assert asking_agent["vals"] == {
            "login_url": "http://t/login", "username": "alice", "password": "s3cret"}


@pytest.fixture
def confirming_agent(monkeypatch):
    """Fake agent run that asks the operator a yes/no confirmation."""
    got = {}

    async def fake_run(text, on_event, on_ask=None):
        got["answer"] = await on_ask({
            "type": "confirm", "question": "Proceed with an intrusive sqlmap scan?",
            "options": [],
        })

    monkeypatch.setattr(agent_run, "run", fake_run)
    return got


async def test_confirmation_pops_a_dialog_not_chat(app, model_active, confirming_agent):
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/assess http://target.example")
        await wait_until(pilot, lambda: app.agent_mode, what="agent mode")
        await settle(pilot)                            # the Template frame mounts
        app.approve_scope()
        await wait_until(pilot, lambda: isinstance(app.screen, ChoiceScreen),
                         what="the confirmation dialog")
        assert isinstance(app.screen, ChoiceScreen)        # popped a dialog, not a chat line
        await pilot.press("1")                              # pick "Yes"
        await wait_until(pilot, lambda: "answer" in confirming_agent, what="the answer")
        assert confirming_agent["answer"] == {"answer": "yes"}


async def test_credential_modal_cancel_returns_none(app, model_active, asking_agent):
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/assess http://target.example")
        await wait_until(pilot, lambda: app.agent_mode, what="agent mode")
        await settle(pilot)                            # the Template frame mounts
        app.approve_scope()
        await wait_until(pilot, lambda: isinstance(app.screen, CredentialForm),
                         what="the credential form")
        assert isinstance(app.screen, CredentialForm)
        await pilot.press("escape")
        await wait_until(pilot, lambda: "vals" in asking_agent, what="the cancelled answer")
        assert asking_agent["vals"] is None
