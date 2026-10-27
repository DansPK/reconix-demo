"""LLM providers: the only seam the UI calls to configure and pick a model.

All validation lives here and raises `StoreValidationError` with a plain message. API
keys are encrypted (Fernet) before they reach the database; this module hands the
plaintext to `client` only for a live call and never logs it. Everything the deterministic
core guards — scope, approvals, the vault — is untouched: a model can only be displayed.
"""

import ipaddress
import json
from typing import List, Optional
from urllib.parse import urlsplit

from ..llm import catalog, client, crypto, db
from ..models import ActiveModel, ProviderView
from ..models.base import utc_now
from .activity import log_event
from .errors import StoreValidationError
from .snapshot import uid_for
from .transcript import add_activity, add_chat

MAX_KEY = 4096
MAX_URL = 2048
MAX_MODEL = 200


def _now() -> str:
    return utc_now().isoformat()


def _require_http(url: str) -> str:
    url = url.strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        raise StoreValidationError("The base URL must start with http:// or https://.")
    if len(url) > MAX_URL:
        raise StoreValidationError("That base URL is too long.")
    if urlsplit(url).username:   # no user:pass@host — the key goes in the key field, encrypted
        raise StoreValidationError("Put the API key in the key field, not in the base URL.")
    return url


def _parse_models(entry: catalog.Provider, models: Optional[List[str]]) -> List[str]:
    names = [m.strip() for m in (models or []) if m and m.strip()]
    for name in names:
        if len(name) > MAX_MODEL:
            raise StoreValidationError("That model name is too long.")
    if not names:
        raise StoreValidationError("At least one model name is required.")
    if not entry.multi_model and len(names) > 1:
        raise StoreValidationError(f"{entry.label} holds a single model.")
    return names


# --- views ------------------------------------------------------------------------

def _view(entry: catalog.Provider, row, active) -> ProviderView:
    active_here = active and active["provider_id"] == entry.id
    facts = dict(
        needs_key=entry.needs_key,
        key_optional=entry.key_requirement == catalog.OPTIONAL,
        base_mode=entry.base_mode,
        multi_model=entry.multi_model,
    )
    if row is None:
        # Some providers already know their models before being configured: Reconix's
        # single model from .env, and the frontier providers' default lineup.
        if entry.base_mode == catalog.BASE_READONLY:
            fixed_models = (catalog.reconix_model(),)
        else:
            fixed_models = entry.default_models      # () for ollama / custom
        return ProviderView(
            id=entry.id, label=entry.label, kind=entry.kind, configured=False,
            base_url=_default_base(entry), models=fixed_models,
            active_model=active["model"] if active_here else "", **facts,
        )
    return ProviderView(
        id=entry.id, label=entry.label, kind=entry.kind, configured=True,
        api_key_hint=row["api_key_hint"] or "",
        base_url=row["base_url"] or "",
        models=tuple(json.loads(row["models_json"])),
        status=row["status"], status_detail=row["status_detail"] or "",
        tested_at=row["tested_at"] or "",
        active_model=active["model"] if active_here else "", **facts,
    )


def _default_base(entry: catalog.Provider) -> str:
    if entry.base_mode == catalog.BASE_READONLY:
        return catalog.reconix_base_url()
    return entry.default_base_url


def list_providers() -> List[ProviderView]:
    """Every catalog entry, configured or not, with its current status."""
    rows = db.all_provider_rows()
    active = db.get_active()
    return [_view(entry, rows.get(entry.id), active) for entry in catalog.all_providers()]


def get_provider(provider_id: str) -> ProviderView:
    entry = catalog.get(provider_id)
    if entry is None:
        raise StoreValidationError("Unknown provider.")
    return _view(entry, db.get_provider_row(provider_id), db.get_active())


# --- writes -----------------------------------------------------------------------

def set_provider(provider_id: str, api_key: Optional[str] = None,
                 base_url: Optional[str] = None,
                 models: Optional[List[str]] = None) -> ProviderView:
    """Add or update a provider. A blank api_key on update keeps the saved key."""
    entry = catalog.get(provider_id)
    if entry is None:
        raise StoreValidationError("Unknown provider.")
    row = db.get_provider_row(provider_id)
    api_key = (api_key or "").strip()
    if len(api_key) > MAX_KEY:
        raise StoreValidationError("That API key is too long.")

    if entry.base_mode == catalog.BASE_READONLY:          # Reconix: env is the only source
        if base_url and base_url.strip() != catalog.reconix_base_url():
            raise StoreValidationError("Reconix's base URL comes from .env and can't be changed.")
        if models and [m.strip() for m in models] != [catalog.reconix_model()]:
            raise StoreValidationError("Reconix's model comes from .env and can't be changed.")
        final_base = catalog.reconix_base_url()
        final_models = [catalog.reconix_model()]
    else:
        if entry.multi_model and not models:
            models = list(entry.default_models)   # frontier: known models, only a key is needed
        final_models = _parse_models(entry, models)
        final_base = _resolve_base(entry, base_url, row)

    # Key handling: required providers need one (unless already saved and left blank).
    enc = row["api_key_enc"] if row else None
    hint = row["api_key_hint"] if row else ""
    if api_key:
        enc, hint = crypto.encrypt(api_key), crypto.hint(api_key)
    elif entry.needs_key and enc is None:
        raise StoreValidationError(f"{entry.label} needs an API key.")

    db.upsert_provider(provider_id, {
        "api_key_enc": enc, "api_key_hint": hint, "base_url": final_base,
        "models_json": json.dumps(final_models), "status": "UNTESTED",
        "status_detail": None, "tested_at": None,
    }, _now())
    log_event("llm.provider.set", provider_id)
    add_activity("SYS", f"LLM provider saved: {entry.label}")
    return get_provider(provider_id)


def _resolve_base(entry: catalog.Provider, base_url: Optional[str], row) -> str:
    provided = (base_url or "").strip()
    if provided:
        return _require_http(provided)
    if row and row["base_url"]:
        return row["base_url"]
    if entry.base_mode == catalog.BASE_REQUIRED:
        raise StoreValidationError(f"{entry.label} needs a base URL.")
    if entry.base_mode == catalog.BASE_DEFAULT:
        return entry.default_base_url
    return ""


def unset_provider(provider_id: str) -> None:
    entry = catalog.get(provider_id)
    if entry is None:
        raise StoreValidationError("Unknown provider.")
    if db.get_provider_row(provider_id) is None:
        raise StoreValidationError(f"{entry.label} is not configured.")
    db.delete_provider(provider_id)
    log_event("llm.provider.unset", provider_id)
    add_activity("SYS", f"LLM provider removed: {entry.label}")


def test_provider(provider_id: str, model: Optional[str] = None) -> ProviderView:
    """Run the reachability test and save the result."""
    entry = catalog.get(provider_id)
    if entry is None:
        raise StoreValidationError("Unknown provider.")
    row = db.get_provider_row(provider_id)
    if row is None:
        raise StoreValidationError(f"{entry.label} is not configured.")
    configured_models = json.loads(row["models_json"])
    model = (model or (configured_models[0] if configured_models else "")).strip()
    key = crypto.decrypt(row["api_key_enc"]) if row["api_key_enc"] else None
    reachable, detail = client.ping(
        provider_id, model, api_key=key, api_base=row["base_url"] or None)
    status = "REACHABLE" if reachable else "UNREACHABLE"
    db.upsert_provider(provider_id, {
        "status": status, "status_detail": detail, "tested_at": _now()}, _now())
    log_event("llm.provider.tested", f"{provider_id}:{status}")
    add_activity("SYS", f"LLM provider {entry.label}: {status.lower()} ({detail})")
    return get_provider(provider_id)


def activate(provider_id: str, model: str) -> ActiveModel:
    """Make (provider, model) the active choice. Refuses unless REACHABLE."""
    entry = catalog.get(provider_id)
    if entry is None:
        raise StoreValidationError("Unknown provider.")
    row = db.get_provider_row(provider_id)
    if row is None:
        raise StoreValidationError(f"{entry.label} is not configured.")
    if row["status"] != "REACHABLE":
        raise StoreValidationError("Test the connection first — the provider is not reachable.")
    model = (model or "").strip()
    if model not in json.loads(row["models_json"]):
        raise StoreValidationError(f"{model or 'That model'} is not configured for {entry.label}.")

    previous = db.get_active()
    uid = uid_for(_current_assessment())
    now = _now()
    db.set_active(provider_id, model, now)
    db.add_switch(uid,
                  previous["provider_id"] if previous else None,
                  previous["model"] if previous else None,
                  provider_id, model, now)
    add_chat("text", "reconix", f"Switched to {entry.label} · {model}", tone="muted")
    add_activity("SYS", f"LLM model active: {entry.label} · {model}")
    log_event("llm.model.activated", f"{provider_id}/{model}")
    return ActiveModel(provider_id, model, entry.label, now)


def active_llm_settings() -> Optional[dict]:
    """LiteLLM params for the active provider/model, for the harness agent bridge.

    Returns ``{model, base_url, api_key, timeout}`` (model is the LiteLLM string, e.g.
    ``ollama_chat/llama3.1``) or ``None`` when nothing is active. The plaintext key is
    decrypted here and handed straight to the agent's client; it is never stored.
    """
    from ..llm import catalog, config, crypto

    active = db.get_active()
    if active is None:
        return None
    entry = catalog.get(active["provider_id"])
    row = db.get_provider_row(active["provider_id"])
    if entry is None or row is None:
        return None
    key = crypto.decrypt(row["api_key_enc"]) if row["api_key_enc"] else ""
    return {
        "model": entry.model_string(active["model"]),
        # Providers that use a custom endpoint pass it; frontier providers resolve
        # on their own (empty base → LiteLLM uses the provider's default).
        "base_url": (row["base_url"] or "") if entry.uses_api_base else "",
        "api_key": key,
        "timeout": config.TIMEOUT,
    }


def active_model() -> Optional[ActiveModel]:
    active = db.get_active()
    if active is None:
        return None
    entry = catalog.get(active["provider_id"])
    label = entry.label if entry else active["provider_id"]
    return ActiveModel(active["provider_id"], active["model"], label,
                       active["activated_at"] or "")


def is_local_url(url: str) -> bool:
    """Whether `url` names this computer: `localhost` or a loopback address."""
    try:
        host = (urlsplit(url).hostname or "").lower()
    except ValueError:
        return False
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def active_remote_label() -> Optional[str]:
    """The active provider's label when the active model runs off this computer (a provider's
    own API, or an endpoint that isn't loopback), else None (a local model, or none active).

    What the operator is told before reference text goes out with their questions.
    """
    active = db.get_active()
    if active is None:
        return None
    row = db.get_provider_row(active["provider_id"])
    base = (row["base_url"] if row else "") or ""   # empty: the provider's own (remote) API
    if base and is_local_url(base):
        return None
    entry = catalog.get(active["provider_id"])
    return entry.label if entry else active["provider_id"]


def _current_assessment():
    from .assessment import get_assessment
    return get_assessment()
