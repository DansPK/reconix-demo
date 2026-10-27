"""Configuration: env (secrets + connection) + YAML (non-secret defaults)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_YAML = PROJECT_ROOT / "config" / "harness.yaml"
# One .env at the repo root configures the whole application (TUI + harness).
REPO_ROOT = PROJECT_ROOT.parent


@dataclass
class LLMSettings:
    base_url: str = ""
    api_key: str = ""
    model: str = ""
    timeout: float = 120.0  # per-request timeout (s); keeps the TUI from hanging

    @property
    def enabled(self) -> bool:
        # A bare model needs a base URL (OpenAI-compatible endpoint); a
        # provider-prefixed model (e.g. "anthropic/…") can resolve on its own.
        return bool(self.model and (self.base_url or "/" in self.model))

    def litellm_params(self) -> dict:
        """LiteLLM call kwargs: model string, api_base, api_key, timeout.

        A bare model + base URL is an OpenAI-compatible endpoint → ``openai/<model>``
        at that base; a provider-prefixed model is passed through as-is.
        """
        model = self.model
        if self.base_url and "/" not in model:
            model = f"openai/{model}"
        return {
            "model": model,
            "api_base": self.base_url or None,
            "api_key": self.api_key or None,
            "timeout": self.timeout,
        }


@dataclass
class KaliMCPSettings:
    transport: str = "stdio"  # stdio | http | sse
    ssh_host: str = ""
    remote_cmd: str = ""
    url: str = ""
    auth_token: str = ""


@dataclass
class Settings:
    llm: LLMSettings
    kali: KaliMCPSettings
    db_path: Path
    yaml: dict[str, Any] = field(default_factory=dict)

    def profile(self, name: str) -> list[str]:
        return list(self.yaml.get("profiles", {}).get(name, []))

    def profiles(self) -> dict[str, list[str]]:
        return dict(self.yaml.get("profiles", {}))

    def scanner_options(self, tool: str) -> str:
        return str(self.yaml.get("scanners", {}).get(tool, {}).get("options", ""))


def load_settings(yaml_path: Path | None = None) -> Settings:
    load_dotenv(REPO_ROOT / ".env")

    path = yaml_path or DEFAULT_YAML
    data: dict[str, Any] = {}
    if path.exists():
        data = yaml.safe_load(path.read_text()) or {}

    # The unified LLM config (the default "reconix" provider). Reconix overrides
    # this per the active /provider before each chat; LLM_API_KEY is optional
    # (the TUI holds provider keys encrypted) for standalone harness use.
    llm = LLMSettings(
        base_url=os.getenv("LLM_BASE_URL", "").strip(),
        api_key=os.getenv("LLM_API_KEY", "").strip(),
        model=os.getenv("LLM_MODEL", "").strip(),
        timeout=float(os.getenv("LLM_TIMEOUT", "120") or 120),
    )
    kali = KaliMCPSettings(
        transport=os.getenv("KALI_MCP_TRANSPORT", "stdio").strip().lower(),
        ssh_host=os.getenv("KALI_MCP_SSH_HOST", "").strip(),
        remote_cmd=os.getenv("KALI_MCP_REMOTE_CMD", "").strip(),
        url=os.getenv("KALI_MCP_URL", "").strip(),
        auth_token=os.getenv("KALI_MCP_AUTH_TOKEN", "").strip(),
    )
    db_path = Path(os.getenv("HARNESS_DB_PATH", str(PROJECT_ROOT / "harness.db"))).expanduser()

    return Settings(llm=llm, kali=kali, db_path=db_path, yaml=data)
