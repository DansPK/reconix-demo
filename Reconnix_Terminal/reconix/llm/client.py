"""Flexible LLM: the unified model interface (LiteLLM wrapper).

`complete()` and `ping()` are the only ways a model is called. The plaintext API key is
decrypted by the store and handed in as an argument — it is never read from the
environment and never stored here. Every LiteLLM error becomes one `LLMError` with a
redacted message, so keys never leak through a traceback.
"""

import json
import urllib.error
import urllib.request
from typing import List, Optional, Tuple

import litellm

from . import catalog, config

# Keys must never reach the console or log files.
litellm.suppress_debug_info = True
litellm.telemetry = False
litellm.set_verbose = False

PING_TIMEOUT = 10
MAX_REPLY_CHARS = 8000


class LLMError(Exception):
    """A model call failed. The message is short, plain and redacted."""


def _redact(text: str) -> str:
    # Lazy import: avoids pulling the store package in at module load time.
    from ..store.redact import redact
    return redact(text)


def _map_error(exc: Exception) -> str:
    """Turn any provider/transport error into a short plain message."""
    status = getattr(exc, "status_code", None)
    if status in (401, 403):
        return "bad API key (unauthorized)"
    if status == 404:
        return "model not found"
    text = str(exc).lower()
    if status == 401 or "unauthor" in text or "invalid api key" in text or "api key" in text:
        return "bad API key (unauthorized)"
    if "not found" in text or "does not exist" in text:
        return "model not found"
    if "timed out" in text or "timeout" in text:
        return "timed out"
    if "refused" in text or "connection" in text or "failed to establish" in text:
        return "connection refused"
    return "could not reach the model"


def complete(provider_id: str, model: str, messages: List[dict], *,
             api_key: Optional[str] = None, api_base: Optional[str] = None) -> str:
    """Send `messages` to the chosen model and return its reply text."""
    entry = catalog.get(provider_id)
    if entry is None:
        raise LLMError("unknown provider")
    try:
        response = litellm.completion(
            model=entry.model_string(model),
            messages=messages,
            api_key=api_key,
            api_base=api_base,
            timeout=config.TIMEOUT,
            num_retries=1,
        )
    except Exception as exc:  # noqa: BLE001 — any LiteLLM/transport error maps to LLMError
        raise LLMError(_map_error(exc)) from None
    return _validate(response)


def _validate(response: object) -> str:
    try:
        choices = response.choices  # type: ignore[attr-defined]
        content = choices[0].message.content
    except (AttributeError, IndexError, TypeError):
        raise LLMError("empty response from the model") from None
    if not isinstance(content, str) or not content.strip():
        raise LLMError("empty response from the model")
    if len(content) > MAX_REPLY_CHARS:
        raise LLMError("the model's reply was too long")
    return content


# --- reachability -----------------------------------------------------------------

def ping(provider_id: str, model: str, *, api_key: Optional[str] = None,
         api_base: Optional[str] = None) -> Tuple[bool, str]:
    """Check whether `model` is reachable. Returns ``(reachable, redacted_detail)``."""
    entry = catalog.get(provider_id)
    if entry is None:
        return False, "unknown provider"
    try:
        if entry.id == "ollama":
            return _ping_ollama(api_base or entry.default_base_url, model)
        if entry.id in ("reconix", "openai_compatible"):
            return _ping_openai_models(api_base, api_key, provider_id, model)
        return _ping_completion(provider_id, model, api_key, api_base)
    except LLMError as exc:
        return False, str(exc)
    except Exception as exc:  # noqa: BLE001
        return False, _redact(_map_error(exc))


def _http_get_json(url: str, api_key: Optional[str]) -> object:
    request = urllib.request.Request(url)
    if api_key:
        request.add_header("Authorization", f"Bearer {api_key}")
    try:
        with urllib.request.urlopen(request, timeout=PING_TIMEOUT) as resp:  # noqa: S310
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise LLMError(_map_error(exc)) from None
    except (urllib.error.URLError, TimeoutError) as exc:
        reason = getattr(exc, "reason", exc)
        if "timed out" in str(reason).lower():
            raise LLMError("timed out") from None
        raise LLMError("connection refused") from None


def _ping_ollama(base_url: str, model: str) -> Tuple[bool, str]:
    data = _http_get_json(base_url.rstrip("/") + "/api/tags", None)
    names = [m.get("name", "") for m in (data.get("models", []) if isinstance(data, dict) else [])]
    # Ollama tags are "llama3.1:latest"; match on the bare name too.
    bare = {n.split(":")[0] for n in names}
    if model in names or model in bare:
        return True, "model available"
    return False, "model not found"


def _ping_openai_models(api_base: Optional[str], api_key: Optional[str],
                        provider_id: str, model: str) -> Tuple[bool, str]:
    base = api_base or (catalog.reconix_base_url() if provider_id == "reconix" else "")
    if not base:
        raise LLMError("no base URL")
    try:
        data = _http_get_json(base.rstrip("/") + "/models", api_key)
    except LLMError:
        # No /models endpoint — fall back to a 1-token completion.
        return _ping_completion(provider_id, model, api_key, api_base)
    ids = [m.get("id", "") for m in (data.get("data", []) if isinstance(data, dict) else [])]
    if model in ids:
        return True, "model available"
    return _ping_completion(provider_id, model, api_key, api_base)


def _ping_completion(provider_id: str, model: str, api_key: Optional[str],
                     api_base: Optional[str]) -> Tuple[bool, str]:
    entry = catalog.get(provider_id)
    try:
        litellm.completion(
            model=entry.model_string(model),
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=1,
            api_key=api_key,
            api_base=api_base,
            timeout=PING_TIMEOUT,
            num_retries=0,
        )
    except Exception as exc:  # noqa: BLE001
        return False, _redact(_map_error(exc))
    return True, "reachable"
