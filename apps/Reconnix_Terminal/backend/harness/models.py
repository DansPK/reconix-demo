"""Core data structures shared across scanners, DB, LLM, and UI.

Everything downstream is generic over these; scanners dispatch on ``Target.type``
and emit ``Finding`` objects regardless of which tool produced them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional


class TargetType(str, Enum):
    WEB = "web"
    API = "api"
    NETWORK = "network"
    SOURCE = "source"


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

    @property
    def rank(self) -> int:
        order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        return order[self.value]

    @classmethod
    def coerce(cls, value: str) -> Optional["Severity"]:
        """The matching severity, or None for Info, unknown or empty (never reported)."""
        try:
            return cls(str(value).strip().lower())
        except ValueError:
            return None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class Target:
    name: str
    type: TargetType
    value: str  # URL for web/api, host/CIDR for network, path for source
    # Authorization gate: no active scan runs unless this is explicitly True.
    authorized: bool = False
    scope: list[str] = field(default_factory=list)
    id: Optional[int] = None
    created_at: str = field(default_factory=_now)


@dataclass
class Finding:
    scan_id: int
    # Always a reportable Severity: Info, unknown and empty values are dropped where findings
    # are made or read (Severity.coerce in the parsers, the agent's http_poc and Database).
    severity: Severity
    title: str
    description: str = ""
    evidence: str = ""
    location: str = ""  # URL, host:port, param, etc.
    cve_id: Optional[str] = None
    cvss_score: Optional[float] = None
    verified: bool = False
    ai_analysis: Optional[str] = None  # filled in by the LLM analyzer
    id: Optional[int] = None


@dataclass
class ScanResult:
    """One tool run against one target."""

    target_id: int
    scanner: str  # tool name, e.g. "nmap"
    status: str = "pending"  # pending | running | completed | failed | skipped
    raw_output: str = ""
    error: str = ""
    findings: list[Finding] = field(default_factory=list)
    id: Optional[int] = None
    started_at: str = field(default_factory=_now)
    completed_at: Optional[str] = None
