"""T4: the typed target is an extra check on top of the HIGH gate (token + hash), never instead."""

import pytest
from textual.widgets import Input

from reconix import store
from reconix.screens.forms.typed_target import TypedTargetForm

from .support import SIZE, run_to, settle

HIGH = "approval-002"
API_REQUEST = "test the API at https://api.example.com/v1"   # the template with a HIGH step


@pytest.fixture
def high():
    run_to(f"approval:{HIGH}", API_REQUEST)
    return store.get_approval(HIGH)


def test_a_wrong_target_is_refused_and_keeps_the_token(high):
    token = store.request_confirmation(HIGH, high.command_hash)
    with pytest.raises(store.StoreValidationError):
        store.approve(HIGH, command_hash=high.command_hash, confirmation_token=token,
                      typed_target="something else")
    assert not store.is_approved(HIGH)
    store.approve(HIGH, command_hash=high.command_hash, confirmation_token=token,
                  typed_target=high.target)
    assert store.is_approved(HIGH)


def test_the_typed_target_does_not_replace_the_token(high):
    with pytest.raises(store.StoreValidationError):
        store.approve(HIGH, command_hash=high.command_hash, typed_target=high.target)
    assert not store.is_approved(HIGH)


async def test_the_form_approves_only_the_exact_target(app, high):
    token = store.request_confirmation(HIGH, high.command_hash)
    results = []
    async with app.run_test(size=SIZE) as pilot:
        app.push_screen(TypedTargetForm(HIGH, token), results.append)
        await settle(pilot)
        field = app.screen.query_one("#target", Input)
        assert field.value == ""                    # never filled in for you
        field.value = "nope"
        app.screen.query_one("#submit").press()
        await settle(pilot)
        assert isinstance(app.screen, TypedTargetForm) and not store.is_approved(HIGH)
        field.value = high.target
        app.screen.query_one("#submit").press()
        await settle(pilot)
    assert results == ["approved"] and store.is_approved(HIGH)
