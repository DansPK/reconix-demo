"""LLM provider store: configure, test and pick the active model (global, single active).

The only place the harness learns which model to use. All provider configuration lives in
the database (`providers` + `active_model` tables); API keys are Fernet-encrypted before
they are stored and only decrypted here for a live call. Nothing is ever returned to the
client except a safe `api_key_hint`. Validation raises `UserError`, which the MCP layer
shows to the user as-is. Ported in concept from Reconnix_Terminal's reconix/store/providers.
"""

import json
import logging
import re
from urllib.parse import urlsplit

from harness import catalog
from harness.crypto import Crypto, hint as key_hint
from harness.db import now
from harness.service import UserError

log = logging.getLogger(__name__)

MAX_KEY = 4096
MAX_URL = 2048
MAX_MODEL = 200
PING_TIMEOUT = 10


def _redact(text):
    """A short, single-line reason without URLs or request details."""
    return re.sub(r"https?://\S+", "<url>", str(text).replace("\n", " ")).strip()[:160]


class ProviderStore:
    """Global provider configuration + the single active model. One per process."""

    def __init__(self, cfg, db):
        self.cfg = cfg
        self.db = db
        self.crypto = Crypto(cfg.llm_key_file)

    # --- views ---

    def _view(self, entry, row, active):
        active_here = bool(active and active["provider_id"] == entry.id)
        facts = dict(needs_key=entry.needs_key, key_optional=entry.key_optional,
                     base_mode=entry.base_mode, multi_model=entry.multi_model, kind=entry.kind)
        if row is None:
            if entry.base_mode == catalog.BASE_READONLY:
                models = tuple(m for m in (catalog.reconix_model(self.cfg),) if m)
            else:
                models = entry.default_models
            return {"id": entry.id, "label": entry.label, "configured": False,
                    "api_key_hint": "", "base_url": self._default_base(entry), "models": list(models),
                    "status": "UNTESTED", "status_detail": "", "tested_at": "",
                    "active_model": active["model"] if active_here else "", **facts}
        return {"id": entry.id, "label": entry.label, "configured": True,
                "api_key_hint": row["api_key_hint"] or "", "base_url": row["base_url"] or "",
                "models": json.loads(row["models_json"]), "status": row["status"],
                "status_detail": row["status_detail"] or "", "tested_at": row["tested_at"] or "",
                "active_model": active["model"] if active_here else "", **facts}

    def _default_base(self, entry):
        if entry.base_mode == catalog.BASE_READONLY:
            return catalog.reconix_base_url(self.cfg)
        return entry.default_base_url

    def _active_view(self):
        active = self.db.get_active()
        if active is None:
            return None
        entry = catalog.get(active["provider_id"])
        if entry is None:  # a provider that is no longer offered: treat as nothing active
            return None
        label = entry.label
        return {"provider_id": active["provider_id"], "model": active["model"],
                "label": label, "activated_at": active["activated_at"] or ""}

    def list_providers(self):
        rows = self.db.all_providers()
        active = self.db.get_active()
        return {"providers": [self._view(e, rows.get(e.id), active) for e in catalog.all_providers()],
                "active": self._active_view()}

    def get_provider(self, provider_id):
        entry = catalog.get(provider_id)
        if entry is None:
            raise UserError("Unknown provider.")
        return self._view(entry, self.db.get_provider(provider_id), self.db.get_active())

    def active_model(self):
        return self._active_view()

    # --- writes ---

    def _require_http(self, url):
        url = url.strip()
        if not (url.startswith("http://") or url.startswith("https://")):
            raise UserError("The base URL must start with http:// or https://.")
        if len(url) > MAX_URL:
            raise UserError("That base URL is too long.")
        if urlsplit(url).username:  # no user:pass@host — the key goes in the key field, encrypted
            raise UserError("Put the API key in the key field, not in the base URL.")
        return url

    def _parse_models(self, entry, models):
        names = [m.strip() for m in (models or []) if m and m.strip()]
        for name in names:
            if len(name) > MAX_MODEL:
                raise UserError("That model name is too long.")
        if not names:
            raise UserError("At least one model name is required.")
        if not entry.multi_model and len(names) > 1:
            raise UserError(f"{entry.label} holds a single model.")
        return names

    def _resolve_base(self, entry, base_url, row):
        if entry.base_mode == catalog.BASE_FIXED:  # OpenAI/Anthropic/DeepSeek: the URL is fixed by the catalog
            return entry.default_base_url
        provided = (base_url or "").strip()
        if provided:
            return self._require_http(provided)
        if row and row["base_url"]:
            return row["base_url"]
        if entry.base_mode == catalog.BASE_REQUIRED:
            raise UserError(f"{entry.label} needs a base URL.")
        if entry.base_mode == catalog.BASE_DEFAULT:
            return self._default_base(entry)
        return ""

    def set_provider(self, provider_id, api_key=None, base_url=None, models=None):
        """Add or update a provider. A blank api_key on update keeps the saved key."""
        entry = catalog.get(provider_id)
        if entry is None:
            raise UserError("Unknown provider.")
        row = self.db.get_provider(provider_id)
        api_key = (api_key or "").strip()
        if len(api_key) > MAX_KEY:
            raise UserError("That API key is too long.")

        if entry.base_mode == catalog.BASE_READONLY:  # reconix: env is the only source
            if not catalog.reconix_model(self.cfg):
                raise UserError("No default model is configured on the server (set LLM_MODEL).")
            if base_url and base_url.strip().rstrip("/") != catalog.reconix_base_url(self.cfg):
                raise UserError("The default provider's base URL comes from the server config and can't be changed.")
            if models and [m.strip() for m in models] != [catalog.reconix_model(self.cfg)]:
                raise UserError("The default provider's model comes from the server config and can't be changed.")
            final_base = catalog.reconix_base_url(self.cfg)
            final_models = [catalog.reconix_model(self.cfg)]
        else:
            if models:
                final_models = self._parse_models(entry, models)
            elif row:  # saving only a key or base URL keeps the saved model(s)
                final_models = json.loads(row["models_json"])
            else:  # the model can come later, with Test
                final_models = list(entry.default_models)
            final_base = self._resolve_base(entry, base_url, row)

        enc = row["api_key_enc"] if row else None
        hint = row["api_key_hint"] if row else ""
        if api_key:
            enc, hint = self.crypto.encrypt(api_key), key_hint(api_key)
        elif entry.needs_key and enc is None:
            raise UserError(f"{entry.label} needs an API key.")

        self.db.upsert_provider(provider_id, {
            "api_key_enc": enc, "api_key_hint": hint, "base_url": final_base,
            "models_json": json.dumps(final_models), "status": "UNTESTED",
            "status_detail": None, "tested_at": None}, now())
        log.info("llm provider saved: %s", provider_id)
        return self.get_provider(provider_id)

    async def test_provider(self, provider_id, model=None):
        """Run the reachability test and save the result."""
        entry = catalog.get(provider_id)
        if entry is None:
            raise UserError("Unknown provider.")
        row = self.db.get_provider(provider_id)
        base = row["base_url"] if row else self._default_base(entry)
        models = json.loads(row["models_json"]) if row else list(self._view(entry, None, None)["models"])
        if entry.needs_key and (row is None or not row["api_key_enc"]):
            raise UserError(f"{entry.label} needs an API key. Enter one first.")
        model = (model or (models[0] if models else "")).strip()
        if not model:
            raise UserError("No model to test. Add a model name first.")
        if len(model) > MAX_MODEL:
            raise UserError("That model name is too long.")
        if entry.base_mode != catalog.BASE_READONLY and model not in models:
            # testing a model by name makes it this provider's model (or adds it, if it holds several)
            models = models + [model] if entry.multi_model else [model]
        key = self.crypto.decrypt(row["api_key_enc"]) if row and row["api_key_enc"] else None
        reachable, detail = await self._ping(entry, model, key, base or None)
        status = "REACHABLE" if reachable else "UNREACHABLE"
        if row is None:  # allow testing a not-yet-saved keyless provider by seeding a row
            self.db.upsert_provider(provider_id, {
                "api_key_enc": None, "api_key_hint": "", "base_url": base or ""}, now())
        self.db.upsert_provider(provider_id, {
            "models_json": json.dumps(models),
            "status": status, "status_detail": _redact(detail), "tested_at": now()}, now())
        log.info("llm provider tested: %s -> %s", provider_id, status)
        return self.get_provider(provider_id)

    def activate(self, provider_id, model):
        """Make (provider, model) the active choice. Refuses unless REACHABLE."""
        entry = catalog.get(provider_id)
        if entry is None:
            raise UserError("Unknown provider.")
        row = self.db.get_provider(provider_id)
        if row is None:
            raise UserError(f"{entry.label} is not configured.")
        if row["status"] != "REACHABLE":
            raise UserError("Test the connection first — the provider is not reachable.")
        model = (model or "").strip()
        if model not in json.loads(row["models_json"]):
            raise UserError(f"{model or 'That model'} is not configured for {entry.label}.")
        self.db.set_active(provider_id, model, now())
        log.info("llm model activated: %s/%s", provider_id, model)
        return self._active_view()

    # --- live settings (plaintext key decrypted here, never stored or logged) ---

    def active_llm_settings(self):
        """LiteLLM params for the active provider/model, or None when nothing is active.
        Returns {model (litellm string), base_url, api_key, timeout}."""
        active = self.db.get_active()
        if active is None:
            return None
        entry = catalog.get(active["provider_id"])
        row = self.db.get_provider(active["provider_id"])
        if entry is None or row is None:
            return None
        key = self.crypto.decrypt(row["api_key_enc"]) if row["api_key_enc"] else ""
        return {"model": entry.model_string(active["model"]),
                "base_url": (row["base_url"] or "") if entry.uses_api_base else "",
                "api_key": key, "timeout": self.cfg.llm_timeout_seconds}

    def active_model_string(self):
        """The LiteLLM model string of the active model, or None."""
        active = self.db.get_active()
        if active is None:
            return None
        entry = catalog.get(active["provider_id"])
        return entry.model_string(active["model"]) if entry else None

    # --- seed + reachability ---

    def seed(self):
        """On first start, seed the default 'reconix' provider from the env config so existing
        deployments keep working. Does nothing if any provider is already configured, or if the
        server has no LLM_MODEL set."""
        if any(catalog.get(pid) for pid in self.db.all_providers()):
            return
        model = catalog.reconix_model(self.cfg)
        base = catalog.reconix_base_url(self.cfg)
        if not model:
            return
        enc = self.crypto.encrypt(self.cfg.llm_api_key) if self.cfg.llm_api_key else None
        hint = key_hint(self.cfg.llm_api_key) if self.cfg.llm_api_key else ""
        self.db.upsert_provider("reconix", {
            "api_key_enc": enc, "api_key_hint": hint, "base_url": base,
            "models_json": json.dumps([model]), "status": "REACHABLE",
            "status_detail": "seeded from server config", "tested_at": now()}, now())
        self.db.set_active("reconix", model, now())
        log.info("seeded default LLM provider from server config: %s", model)

    async def _ping(self, entry, model, api_key, api_base):
        """Return (reachable, detail). OpenAI-format providers (reconix + anything with the openai
        prefix: OpenAI, DeepSeek, Ollama, the generic compatible one) query /models, then fall back
        to a 1-token completion; Anthropic sends a 1-token completion."""
        try:
            if entry.id == "reconix" or entry.litellm_prefix == "openai":
                return await self._ping_openai_models(entry, model, api_key, api_base)
            return await self._ping_completion(entry, model, api_key, api_base)
        except Exception as e:  # noqa: BLE001 — any transport/provider error is just "unreachable"
            return False, _redact(_map_error(e))

    async def _ping_openai_models(self, entry, model, api_key, api_base):
        base = api_base or self._default_base(entry)
        if not base:
            raise RuntimeError("no base URL")
        try:
            data = await self._get_json(base.rstrip("/") + "/models", api_key)
        except Exception:  # noqa: BLE001 — no /models endpoint, fall back to a completion
            return await self._ping_completion(entry, model, api_key, api_base)
        ids = [m.get("id", "") for m in (data.get("data", []) if isinstance(data, dict) else [])]
        if model in ids:
            return True, "model available"
        return await self._ping_completion(entry, model, api_key, api_base)

    async def _ping_completion(self, entry, model, api_key, api_base):
        import litellm
        litellm.suppress_debug_info = True
        try:
            await litellm.acompletion(model=entry.model_string(model),
                                      messages=[{"role": "user", "content": "ping"}], max_tokens=1,
                                      api_key=api_key, api_base=api_base or None, timeout=PING_TIMEOUT,
                                      num_retries=0)
        except Exception as e:  # noqa: BLE001
            return False, _redact(_map_error(e))
        return True, "reachable"

    async def _get_json(self, url, api_key):
        import httpx
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        async with httpx.AsyncClient(timeout=PING_TIMEOUT) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.json()


def _map_error(exc):
    """Turn any provider/transport error into a short plain message (no keys, no URLs)."""
    status = getattr(exc, "status_code", None)
    if status in (401, 403):
        return "bad API key (unauthorized)"
    if status == 404:
        return "model not found"
    text = str(exc).lower()
    if "unauthor" in text or "invalid api key" in text or "api key" in text:
        return "bad API key (unauthorized)"
    if "not found" in text or "does not exist" in text:
        return "model not found"
    if "timed out" in text or "timeout" in text:
        return "timed out"
    if "refused" in text or "connection" in text or "failed to establish" in text:
        return "connection refused"
    return "could not reach the model"
