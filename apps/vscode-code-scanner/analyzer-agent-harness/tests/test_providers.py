"""Flexible-model provider store: catalog, encrypted keys, test-before-activate."""

import pytest

from harness import catalog
from harness.db import DB
from harness.providers import ProviderStore
from harness.service import UserError
from mcp_client import call, connect

ALL_IDS = ["reconix", "openai", "anthropic", "deepseek", "ollama", "openai_compatible"]


@pytest.fixture
def store(cfg):
    return ProviderStore(cfg, DB(cfg.db_path))


def test_catalog_providers_and_resolution():
    assert [p.id for p in catalog.all_providers()] == ALL_IDS
    assert catalog.get("anthropic").model_string("claude-3-5-sonnet-latest") == "anthropic/claude-3-5-sonnet-latest"
    assert catalog.get("deepseek").model_string("deepseek-chat") == "openai/deepseek-chat"  # OpenAI-compatible under the hood
    assert catalog.get("openai_compatible").model_string("qwen2.5-coder") == "openai/qwen2.5-coder"
    # The default provider's model is already a full LiteLLM string; it is used verbatim.
    assert catalog.get("reconix").model_string("openai/foo") == "openai/foo"
    # Chat commands may use the short names / aliases.
    assert catalog.resolve("Anthropic").id == "anthropic"
    assert catalog.resolve("claude").id == "anthropic"
    assert catalog.resolve("openai").id == "openai"
    assert catalog.resolve("gpt").id == "openai"
    assert catalog.resolve("deepseek").id == "deepseek"
    assert catalog.resolve("ollama").id == "ollama"
    assert catalog.resolve("openai-compatible").id == "openai_compatible"


def test_seed_from_env_config(store):
    store.seed()
    active = store.active_model()
    assert active["provider_id"] == "reconix" and active["model"] == "openai/fake"
    assert active["label"] == "Reconix"
    # The env LLM_MODEL is not re-prefixed.
    assert store.active_llm_settings()["model"] == "openai/fake"
    # Seeding is a no-op once anything is configured.
    store.seed()
    assert len(store.db.all_providers()) == 1


def test_removed_provider_is_not_active(store):
    # A row and active choice left over from a provider that is no longer offered.
    store.db.upsert_provider("legacy_provider", {"api_key_enc": None, "api_key_hint": "", "base_url": "",
                                                 "models_json": '["some-model"]', "status": "REACHABLE"}, "t")
    store.db.set_active("legacy_provider", "some-model", "t")
    assert store.active_model() is None and store.active_llm_settings() is None
    assert "legacy_provider" not in [p["id"] for p in store.list_providers()["providers"]]
    store.seed()  # leftover rows don't block seeding the default
    assert store.active_model()["provider_id"] == "reconix"


def test_set_provider_validation(store):
    with pytest.raises(UserError, match="Unknown provider"):
        store.set_provider("nope")
    with pytest.raises(UserError, match="Unknown provider"):
        store.set_provider("claude")  # an alias is for chat commands, not the API
    with pytest.raises(UserError, match="key field"):
        store.set_provider("openai_compatible", api_key="k", base_url="http://user:pass@host", models=["m"])
    with pytest.raises(UserError, match="http"):
        store.set_provider("openai_compatible", api_key="k", base_url="ftp://host", models=["m"])
    with pytest.raises(UserError, match="single model"):
        store.set_provider("openai_compatible", api_key="k", base_url="http://llm/v1", models=["a", "b"])


def test_base_url_rules_per_provider(store):
    views = {p["id"]: p for p in store.list_providers()["providers"]}
    # Fixed-URL providers (OpenAI/Anthropic/DeepSeek): the base comes from the catalog, key required.
    assert views["openai"]["base_url"] == "https://api.openai.com/v1"
    assert views["anthropic"]["base_url"] == "https://api.anthropic.com"
    assert views["deepseek"]["base_url"] == "https://api.deepseek.com/v1"
    assert views["openai"]["needs_key"] and not views["openai"]["key_optional"]
    assert views["openai"]["base_mode"] == "fixed"
    # A fixed provider ignores any base URL sent to it.
    v = store.set_provider("openai", api_key="sk-x", base_url="https://evil.example/v1")
    assert v["base_url"] == "https://api.openai.com/v1"
    # Ollama: base URL is user-controlled and required, key optional.
    assert views["ollama"]["base_mode"] == "required" and views["ollama"]["key_optional"]
    v = store.set_provider("ollama", base_url="http://localhost:11434/v1", models=["qwen2.5-coder"])
    assert v["base_url"] == "http://localhost:11434/v1" and v["configured"]
    # Saving only the key later keeps the base URL.
    v = store.set_provider("ollama", api_key="sk-x")
    assert v["base_url"] == "http://localhost:11434/v1"


def test_key_is_encrypted_and_never_returned(store):
    view = store.set_provider("anthropic", api_key="sk-secret-value-1234")
    assert view["configured"] and view["api_key_hint"] == "sk-…1234"
    assert "sk-secret-value-1234" not in str(store.list_providers())
    # Stored encrypted, decryptable only via the store.
    row = store.db.get_provider("anthropic")
    assert row["api_key_enc"] and b"sk-secret-value-1234" not in row["api_key_enc"]
    assert store.active_llm_settings() is None  # set != active


def test_fixed_provider_needs_a_key(store):
    # OpenAI/Anthropic/DeepSeek require a key before anything else.
    with pytest.raises(UserError, match="needs an API key"):
        store.set_provider("openai", models=["gpt-4o"])


async def test_test_saves_the_typed_model_then_activate(store, monkeypatch):
    # Key first (no model yet), then Test with a model name: the name is saved, so Activate works.
    store.set_provider("anthropic", api_key="sk-x")
    with pytest.raises(UserError, match="not reachable"):
        store.activate("anthropic", "claude-opus-5-5")

    async def fake_ping(entry, model, api_key, api_base):
        return True, "reachable"

    monkeypatch.setattr(store, "_ping", fake_ping)
    view = await store.test_provider("anthropic", "claude-opus-5-5")
    assert view["status"] == "REACHABLE" and view["models"] == ["claude-opus-5-5"]
    with pytest.raises(UserError, match="not configured for"):
        store.activate("anthropic", "no-such-model")
    active = store.activate("anthropic", "claude-opus-5-5")
    assert active["provider_id"] == "anthropic" and active["label"] == "Anthropic"
    settings = store.active_llm_settings()
    assert settings["model"] == "anthropic/claude-opus-5-5"
    assert settings["base_url"] == "https://api.anthropic.com" and settings["api_key"] == "sk-x"


async def test_test_provider_needs_a_model(store):
    # Ollama needs no key, so the model is what's missing.
    with pytest.raises(UserError, match="No model"):
        await store.test_provider("ollama")


async def _reachable(harness_server, monkeypatch):
    async def fake_ping(entry, model, api_key, api_base):
        return True, "reachable"
    monkeypatch.setattr(harness_server.service.store, "_ping", fake_ping)


async def test_provider_tools_end_to_end(harness_server, tokens, monkeypatch):
    await _reachable(harness_server, monkeypatch)
    async with connect(harness_server.url, tokens["alice"]) as c:
        lp = await call(c, "list_providers", {})
        assert lp["active"]["provider_id"] == "reconix"
        assert [p["id"] for p in lp["providers"]] == ALL_IDS

        v = await call(c, "set_provider", {"provider_id": "openai_compatible", "api_key": "sk-secret",
                                           "base_url": "http://llm.example/v1"})
        assert v["configured"] and "sk-secret" not in str(v)

        t = await call(c, "test_provider", {"provider_id": "openai_compatible", "model": "qwen2.5-coder"})
        assert t["status"] == "REACHABLE" and t["models"] == ["qwen2.5-coder"]

        a = await call(c, "activate_model", {"provider_id": "openai_compatible", "model": "qwen2.5-coder"})
        assert a["provider_id"] == "openai_compatible" and a["model"] == "qwen2.5-coder"
        assert (await call(c, "active_model", {}))["active"]["model"] == "qwen2.5-coder"


async def test_chat_switch_model(harness_server, tokens, monkeypatch):
    await _reachable(harness_server, monkeypatch)
    async with connect(harness_server.url, tokens["alice"]) as c:
        sid = (await call(c, "create_session", {}))["session_id"]
        # A provider that isn't set up yet is routed to the picker; keys are never asked in chat.
        r = await call(c, "chat", {"session_id": sid, "message": "switch to anthropic/claude-opus-5-5"})
        assert r["action"]["type"] == "configure_model" and "picker" in r["reply"].lower()
        assert r["action"]["provider"] == "anthropic"

        await call(c, "set_provider", {"provider_id": "anthropic", "api_key": "sk-x"})
        r = await call(c, "chat", {"session_id": sid, "message": "switch to anthropic/claude-opus-5-5"})
        assert r["action"] is None and r["reply"].startswith("Switched to")
        assert harness_server.service.store.active_model()["provider_id"] == "anthropic"
