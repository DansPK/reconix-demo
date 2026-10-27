"""Flexible LLM: the static provider catalog.

One frozen entry per supported provider. There are no database rows for providers that
are not configured; this catalog is the fixed source of labels, kinds and the rules the
store enforces (key requirement, how many models, how the base URL behaves). Reconix is
listed first and is the default choice in menus.
"""

from dataclasses import dataclass
from typing import Optional, Tuple

from . import config

# Key / base-URL requirements.
REQUIRED = "required"
OPTIONAL = "optional"
NONE = "none"

# How the base URL behaves per provider.
BASE_READONLY = "readonly"   # comes from .env, operator cannot change (Reconix)
BASE_OPTIONAL = "optional"   # frontier providers; passed only if given
BASE_DEFAULT = "default"     # a sensible default, editable (Ollama)
BASE_REQUIRED = "required"   # must be supplied (custom OpenAI-compatible)


@dataclass(frozen=True)
class Provider:
    id: str
    label: str
    kind: str                 # reconix | frontier | local
    key_requirement: str      # REQUIRED | OPTIONAL | NONE
    multi_model: bool         # frontier holds many; the rest exactly one
    base_mode: str            # BASE_* above
    litellm_prefix: str       # openai | anthropic | deepseek | ollama_chat
    default_base_url: str = ""
    default_models: Tuple[str, ...] = ()   # frontier: known models, so only a key is needed

    @property
    def needs_key(self) -> bool:
        return self.key_requirement == REQUIRED

    @property
    def uses_api_base(self) -> bool:
        """Whether a base URL is always sent to LiteLLM for this provider."""
        return self.base_mode in (BASE_READONLY, BASE_DEFAULT, BASE_REQUIRED)

    def model_string(self, model: str) -> str:
        """The LiteLLM model identifier, e.g. ``anthropic/claude-…`` or ``openai/gpt-4o``."""
        return f"{self.litellm_prefix}/{model}"


# Order matters: Reconix first (the default), then frontier, then local.
_CATALOG: Tuple[Provider, ...] = (
    Provider("reconix", "Reconix (default)", "reconix", REQUIRED, False,
             BASE_READONLY, "openai"),
    Provider("openai", "OpenAI", "frontier", REQUIRED, True, BASE_OPTIONAL, "openai",
             default_models=("gpt-4o-mini", "gpt-4o")),
    Provider("anthropic", "Anthropic", "frontier", REQUIRED, True, BASE_OPTIONAL, "anthropic",
             default_models=("claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5")),
    Provider("deepseek", "DeepSeek", "frontier", REQUIRED, True, BASE_OPTIONAL, "deepseek",
             default_models=("deepseek-chat", "deepseek-reasoner")),
    Provider("ollama", "Ollama", "local", NONE, False, BASE_DEFAULT, "ollama_chat",
             default_base_url=config.OLLAMA_BASE_URL),
    Provider("openai_compatible", "Custom OpenAI-compatible", "local", OPTIONAL, False,
             BASE_REQUIRED, "openai"),
)

_BY_ID = {p.id: p for p in _CATALOG}


def all_providers() -> Tuple[Provider, ...]:
    return _CATALOG


def get(provider_id: str) -> Optional[Provider]:
    return _BY_ID.get(provider_id)


def reconix_base_url() -> str:
    return config.RECONIX_BASE_URL


def reconix_model() -> str:
    return config.RECONIX_MODEL
