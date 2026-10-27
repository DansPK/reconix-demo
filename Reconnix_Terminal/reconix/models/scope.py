"""The scope manifest and the policy engine's verdict on each proposed request."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List

from .base import utc_now


@dataclass
class ScopeManifest:
    kind: str                 # web_url | api | network | source — how a target is judged
    target_url: str           # the scope's base: a URL, a host/CIDR, or a repo ref
    assessment_type: str
    allowed_actions: List[str]
    allowed_methods: List[str]
    excluded_paths: List[str]
    time_limit_minutes: int
    tools: List[str]
    allowed_ports: List[int] = field(default_factory=list)   # network only
    status: str = "DRAFT"     # "DRAFT" | "APPROVED"


@dataclass(frozen=True)
class ScopeSummary:
    """A scope manifest in plain words, for a person to read before approving it."""
    headline: str             # "Reconix will test X as a web application."
    may_do: List[str]
    never: List[str]          # what it must not touch (empty: nothing excluded)
    tools: List[str]


@dataclass
class PolicyVerdict:
    method: str
    path: str
    allowed: bool
    reason: str
    created_at: datetime = field(default_factory=utc_now)
