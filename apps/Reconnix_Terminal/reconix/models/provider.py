"""Masked views of an LLM provider and the active model (what screens read)."""

from dataclasses import dataclass
from typing import Tuple


@dataclass(frozen=True)
class ActiveModel:
    provider_id: str
    model: str
    label: str = ""            # the provider's human label, for the status bar
    activated_at: str = ""


@dataclass(frozen=True)
class ProviderView:
    id: str
    label: str
    kind: str                  # reconix | frontier | local
    configured: bool           # a row exists in the database
    api_key_hint: str = ""     # e.g. "sk-…3f9a"; safe to show, never the key
    base_url: str = ""
    models: Tuple[str, ...] = ()
    status: str = "UNTESTED"   # UNTESTED | REACHABLE | UNREACHABLE
    status_detail: str = ""
    tested_at: str = ""
    active_model: str = ""     # the model active for this provider, if any
    # Static facts from the catalog, so the form/menus need no llm imports:
    needs_key: bool = False    # an API key is required
    key_optional: bool = False  # a key may be given but isn't required
    base_mode: str = ""        # readonly | optional | default | required
    multi_model: bool = False  # holds a list of models (frontier)

    @property
    def reachable(self) -> bool:
        return self.status == "REACHABLE"

    @property
    def shows_key_field(self) -> bool:
        return self.needs_key or self.key_optional

    @property
    def shows_base_field(self) -> bool:
        # Only Ollama (default URL) and the custom endpoint (required) take a base URL.
        # Frontier providers use their known endpoint; Reconix's comes from .env.
        return self.base_mode in ("default", "required")

    @property
    def shows_models_field(self) -> bool:
        # Same set: frontier providers ship default models, so only a key is needed.
        return self.base_mode in ("default", "required")
