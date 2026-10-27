"""Prompt history: the store list and the ↑/↓ navigator."""

import pytest

from reconix import store
from reconix.store.seed import DEMO_REQUEST as USER_REQUEST


def test_history_is_seeded_with_the_demo_request():
    assert store.list_history() == [USER_REQUEST]


def test_add_history_normalizes_and_skips_repeats():
    store.add_history("  /plan  ")
    store.add_history("/plan")
    assert store.list_history() == [USER_REQUEST, "/plan"]


def test_add_history_rejects_empty_and_long_text():
    with pytest.raises(store.StoreValidationError):
        store.add_history("   ")
    with pytest.raises(store.StoreValidationError):
        store.add_history("x" * 501)


def test_history_keeps_the_last_hundred():
    for i in range(120):
        store.add_history(f"request {i}")
    history = store.list_history()
    assert len(history) == 100
    assert history[-1] == "request 119"
