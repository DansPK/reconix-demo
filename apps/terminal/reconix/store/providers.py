"""LLM providers and the active model — the seam the `/provider` and `/model` commands use.

State lives in process memory (no network, no database): a fixed catalog of supported
providers, the per-provider configuration an operator sets, and the one active model. The
function names and signatures match what a backend-backed store would expose, so the screens
and `shell/llm.py` do not change when this is wired to the real backend.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from ..models import ActiveModel, ProviderView
from .errors import StoreValidationError


# --- the static catalog ---------------------------------------------------------------------
@dataclass(frozen=True)
class _Facts:
    label: str
    kind: str                 # reconix | frontier | local
    needs_key: bool
    key_optional: bool
    base_mode: str            # readonly | optional | default | required
    multi_model: bool
    default_base_url: str = ""
    default_models: Tuple[str, ...] = ()


# Order matters: Reconix first (the default), then the frontier clouds, then local.
_CATALOG: Tuple[Tuple[str, _Facts], ...] = (
    ("reconix", _Facts("Reconix (default)", "reconix", True, False, "readonly", False,
                        "http://localhost:11434/v1", ("reconix-sec-1",))),
    ("openai", _Facts("OpenAI", "frontier", True, False, "optional", True,
                      default_models=("gpt-4o-mini", "gpt-4o"))),
    ("anthropic", _Facts("Anthropic", "frontier", True, False, "optional", True,
                         default_models=("claude-sonnet-5-5", "claude-opus-5-5",
                                         "claude-haiku-5-5"))),
    ("deepseek", _Facts("DeepSeek", "frontier", True, False, "optional", True,
                        default_models=("deepseek-chat", "deepseek-reasoner"))),
    ("ollama", _Facts("Ollama", "local", False, False, "default", False,
                      "http://localhost:11434", ("llama3.1",))),
    ("openai_compatible", _Facts("Custom OpenAI-compatible", "local", False, True, "required",
                                 False)),
)
_FACTS: Dict[str, _Facts] = dict(_CATALOG)
_ORDER: Tuple[str, ...] = tuple(pid for pid, _ in _CATALOG)


# --- in-memory state ------------------------------------------------------------------------
@dataclass
class _Config:
    api_key_hint: str
    base_url: str
    models: Tuple[str, ...]
    status: str = "UNTESTED"       # UNTESTED | REACHABLE | UNREACHABLE
    status_detail: str = ""
    tested_at: str = ""


_CONFIGS: Dict[str, _Config] = {}
_ACTIVE: List[Optional[ActiveModel]] = [None]


def _now() -> str:
    return datetime.now().strftime("%H:%M:%S")


def reset_providers() -> None:
    """Re-seed to the starting set (called from the store's demo-data load)."""
    _CONFIGS.clear()
    _CONFIGS["reconix"] = _Config("sk-…r3c0", _FACTS["reconix"].default_base_url,
                                  _FACTS["reconix"].default_models, "REACHABLE",
                                  "Responded in 0.3 s", _now())
    _CONFIGS["openai"] = _Config("sk-…9f3a", "", _FACTS["openai"].default_models,
                                 "REACHABLE", "Responded in 0.5 s", _now())
    _CONFIGS["anthropic"] = _Config("sk-ant-…77c2", "", _FACTS["anthropic"].default_models,
                                    "REACHABLE", "Responded in 0.6 s", _now())
    _ACTIVE[0] = ActiveModel("reconix", "reconix-sec-1", "Reconix (default)", _now())


# --- reads ----------------------------------------------------------------------------------
def _facts(provider_id: str) -> _Facts:
    facts = _FACTS.get(provider_id)
    if facts is None:
        raise StoreValidationError(f"Unknown provider '{provider_id}'.")
    return facts


def get_provider(provider_id: str) -> ProviderView:
    facts = _facts(provider_id)
    cfg = _CONFIGS.get(provider_id)
    active = _ACTIVE[0]
    active_here = active.model if active and active.provider_id == provider_id else ""
    if cfg is None:
        return ProviderView(
            id=provider_id, label=facts.label, kind=facts.kind, configured=False,
            base_url=facts.default_base_url, models=facts.default_models,
            needs_key=facts.needs_key, key_optional=facts.key_optional,
            base_mode=facts.base_mode, multi_model=facts.multi_model)
    return ProviderView(
        id=provider_id, label=facts.label, kind=facts.kind, configured=True,
        api_key_hint=cfg.api_key_hint, base_url=cfg.base_url, models=cfg.models,
        status=cfg.status, status_detail=cfg.status_detail, tested_at=cfg.tested_at,
        active_model=active_here, needs_key=facts.needs_key, key_optional=facts.key_optional,
        base_mode=facts.base_mode, multi_model=facts.multi_model)


def list_providers() -> List[ProviderView]:
    return [get_provider(pid) for pid in _ORDER]


def active_model() -> Optional[ActiveModel]:
    return _ACTIVE[0]


# --- writes ---------------------------------------------------------------------------------
def set_provider(provider_id: str, *, api_key: Optional[str] = None,
                 base_url: Optional[str] = None,
                 models: Optional[List[str]] = None) -> ProviderView:
    facts = _facts(provider_id)
    existing = _CONFIGS.get(provider_id)
    key = (api_key or "").strip()
    if facts.needs_key and not key and existing is None:
        raise StoreValidationError(f"{facts.label} needs an API key.")

    hint = existing.api_key_hint if existing else ""
    if key:
        hint = f"…{key[-4:]}" if len(key) >= 4 else "set"

    # Base URL and models: only the local providers take them; the rest are fixed by the catalog.
    new_base = facts.default_base_url
    new_models = facts.default_models
    if facts.base_mode in ("default", "required"):
        new_base = (base_url or "").strip() or (existing.base_url if existing else
                                                 facts.default_base_url)
        if facts.base_mode == "required" and not new_base:
            raise StoreValidationError(f"{facts.label} needs a base URL.")
        picked = tuple(m for m in (models or []) if m)
        new_models = picked or (existing.models if existing else facts.default_models)
        if not new_models:
            raise StoreValidationError(f"{facts.label} needs at least one model.")

    # A new key or endpoint must be tested again before it can be used.
    _CONFIGS[provider_id] = _Config(hint, new_base, new_models)
    return get_provider(provider_id)


def unset_provider(provider_id: str) -> None:
    facts = _facts(provider_id)
    if provider_id not in _CONFIGS:
        raise StoreValidationError(f"{facts.label} is not configured.")
    del _CONFIGS[provider_id]
    active = _ACTIVE[0]
    if active and active.provider_id == provider_id:
        _ACTIVE[0] = None


def test_provider(provider_id: str) -> ProviderView:
    facts = _facts(provider_id)
    cfg = _CONFIGS.get(provider_id)
    if cfg is None:
        raise StoreValidationError(f"{facts.label} is not configured.")
    cfg.status = "REACHABLE"
    cfg.status_detail = f"Responded in 0.4 s · {cfg.models[0]}"
    cfg.tested_at = _now()
    return get_provider(provider_id)


def activate(provider_id: str, model: str) -> ActiveModel:
    facts = _facts(provider_id)
    cfg = _CONFIGS.get(provider_id)
    if cfg is None:
        raise StoreValidationError(f"{facts.label} is not configured.")
    if cfg.status != "REACHABLE":
        raise StoreValidationError(f"Test {facts.label} first.")
    if model not in cfg.models:
        raise StoreValidationError(f"{facts.label} has no model '{model}'.")
    _ACTIVE[0] = ActiveModel(provider_id, model, facts.label, _now())
    return _ACTIVE[0]
