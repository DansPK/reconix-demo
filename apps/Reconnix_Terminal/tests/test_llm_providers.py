"""Flexible LLM: provider configuration, encryption and reachability (store level)."""

import pytest

from reconix import store
from reconix.llm import client

SECRET_KEY = "sk-live-SECRET-0ff9a"   # must never land in the DB, a hint, chat or a snapshot


# --- set / update / unset ---------------------------------------------------------

def test_set_provider_saves_one_row():
    view = store.set_provider("openai", api_key=SECRET_KEY, models=["gpt-4o-mini", "gpt-4o"])
    assert view.configured
    assert view.models == ("gpt-4o-mini", "gpt-4o")
    assert view.status == "UNTESTED"
    # A second set updates the same row, not a new one.
    store.set_provider("openai", models=["gpt-4o-mini"])
    assert store.get_provider("openai").models == ("gpt-4o-mini",)


def test_update_blank_key_keeps_key_and_resets_status(reachable):
    store.set_provider("openai", api_key=SECRET_KEY, models=["gpt-4o-mini"])
    store.test_provider("openai")
    assert store.get_provider("openai").status == "REACHABLE"
    before = store.get_provider("openai").api_key_hint
    view = store.set_provider("openai", models=["gpt-4o-mini", "gpt-4o"])   # blank key
    assert view.api_key_hint == before          # key kept
    assert view.status == "UNTESTED"             # any change resets status


def test_unset_removes_row_and_clears_active(reachable):
    store.set_provider("openai", api_key=SECRET_KEY, models=["gpt-4o-mini"])
    store.test_provider("openai")
    store.activate("openai", "gpt-4o-mini")
    assert store.active_model() is not None
    store.unset_provider("openai")
    assert store.get_provider("openai").configured is False
    assert store.active_model() is None


def test_frontier_provider_needs_only_a_key():
    for pid, expected in [("openai", "gpt-4o-mini"),
                          ("anthropic", "claude-sonnet-5-5"),
                          ("deepseek", "deepseek-chat")]:
        view = store.set_provider(pid, api_key=SECRET_KEY)   # no base URL, no models
        assert view.configured
        assert view.base_url == ""
        assert expected in view.models            # built-in default lineup


def test_single_model_providers_reject_two_models():
    for pid in ("ollama", "reconix", "openai_compatible"):
        with pytest.raises(store.StoreValidationError):
            store.set_provider(pid, api_key="k", base_url="http://h/v1",
                               models=["a", "b"])


# --- encryption -------------------------------------------------------------------

def test_api_key_is_encrypted_and_never_leaks(reachable):
    from reconix.llm import config
    store.set_provider("openai", api_key=SECRET_KEY, models=["gpt-4o-mini"])
    raw = config.DB_PATH.read_bytes()
    assert SECRET_KEY.encode() not in raw                 # plaintext not in the DB
    hint = store.get_provider("openai").api_key_hint
    assert hint == "sk-…ff9a"                             # masked fingerprint only
    assert SECRET_KEY not in hint
    # Not in a snapshot either.
    from reconix.store.snapshot import snapshot
    assert SECRET_KEY not in str(snapshot(store.get_assessment()))


# --- reachability -----------------------------------------------------------------

def test_reachable_when_ping_ok(monkeypatch):
    monkeypatch.setattr(client, "ping", lambda pid, model, **kw: (True, "reachable"))
    store.set_provider("openai", api_key=SECRET_KEY, models=["gpt-4o-mini"])
    assert store.test_provider("openai").status == "REACHABLE"


@pytest.mark.parametrize("detail", ["bad API key (unauthorized)", "timed out", "model not found"])
def test_unreachable_keeps_plain_detail(monkeypatch, detail):
    monkeypatch.setattr(client, "ping", lambda pid, model, **kw: (False, detail))
    store.set_provider("openai", api_key="wrong", models=["gpt-4o-mini"])
    view = store.test_provider("openai")
    assert view.status == "UNREACHABLE"
    assert view.status_detail == detail


# --- activation guard -------------------------------------------------------------

def test_activate_blocked_unless_reachable(monkeypatch):
    store.set_provider("openai", api_key=SECRET_KEY, models=["gpt-4o-mini"])
    with pytest.raises(store.StoreValidationError):        # UNTESTED
        store.activate("openai", "gpt-4o-mini")
    monkeypatch.setattr(client, "ping", lambda pid, model, **kw: (False, "bad API key"))
    store.test_provider("openai")
    with pytest.raises(store.StoreValidationError):        # UNREACHABLE
        store.activate("openai", "gpt-4o-mini")


def test_activate_rejects_unknown_model(reachable):
    store.set_provider("openai", api_key=SECRET_KEY, models=["gpt-4o-mini"])
    store.test_provider("openai")
    with pytest.raises(store.StoreValidationError):
        store.activate("openai", "gpt-5-turbo")


# --- Reconix is driven by .env ----------------------------------------------------

def test_reconix_base_and_model_come_from_env():
    from reconix.llm import config
    view = store.set_provider("reconix", api_key=SECRET_KEY)
    assert view.base_url == config.RECONIX_BASE_URL
    assert view.models == (config.RECONIX_MODEL,)
    with pytest.raises(store.StoreValidationError):
        store.set_provider("reconix", api_key=SECRET_KEY, base_url="http://evil/v1")
    with pytest.raises(store.StoreValidationError):
        store.set_provider("reconix", api_key=SECRET_KEY, models=["other-model"])


def test_base_url_rejects_embedded_credentials():
    with pytest.raises(store.StoreValidationError):
        store.set_provider("openai_compatible", base_url="https://user:pass@host/v1",
                           models=["local-model"])


def test_key_file_and_db_are_0600():
    from reconix.llm import config, crypto
    crypto.load_or_create_key()
    store.set_provider("openai", api_key=SECRET_KEY, models=["gpt-4o-mini"])
    assert (config.KEY_FILE.stat().st_mode & 0o777) == 0o600
    assert (config.DB_PATH.stat().st_mode & 0o777) == 0o600


def test_display_status_lists_every_provider():
    ids = [p.id for p in store.list_providers()]
    assert ids[0] == "reconix"                            # listed first / default
    assert set(ids) == {"reconix", "openai", "anthropic", "deepseek",
                        "ollama", "openai_compatible"}
