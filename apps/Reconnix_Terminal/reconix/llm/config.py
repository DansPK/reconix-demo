"""Flexible LLM: environment-backed configuration.

Loads `.env` once at import and exposes module-level constants. Tests monkeypatch the
constants (`DB_PATH`, `KEY_FILE`, …) rather than the env vars, mirroring how
`tests/conftest.py` redirects `persist.DATA_DIR`. The Reconix provider's base URL and
model are read-only here — the TUI never lets the operator change them.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# One .env at the repo root configures the whole application (TUI + harness).
_REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_REPO_ROOT / ".env")  # no-op if absent


def _path(env_name: str, default: str) -> Path:
    return Path(os.environ.get(env_name, default)).expanduser()


def _int(env_name: str, default: int) -> int:
    try:
        return int(os.environ.get(env_name, default))
    except (TypeError, ValueError):
        return default


DB_PATH: Path = _path("LLM_DB", "~/.reconix/llm.db")
KEY_FILE: Path = _path("LLM_KEY_FILE", "~/.reconix/llm.key")
TIMEOUT: int = _int("LLM_TIMEOUT", 120)

# The unified LLM config IS the built-in "reconix" provider: base URL and model
# come from .env (read-only in the TUI); its API key is entered in the TUI.
RECONIX_BASE_URL: str = os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1")
RECONIX_MODEL: str = os.environ.get("LLM_MODEL", "your-model-id")

OLLAMA_BASE_URL: str = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
