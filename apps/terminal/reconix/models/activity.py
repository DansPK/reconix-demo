"""Audit trail of operator actions and the prompt history."""

from dataclasses import dataclass, field
from datetime import datetime

from .base import utc_now


@dataclass
class AuditEvent:
    kind: str          # dotted name, e.g. "scope.approved"
    operator: str
    detail: str = ""
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class HistoryEntry:
    """One line submitted at a prompt: a request or a slash command."""

    text: str
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class Feedback:
    """Free-text guidance typed at a decision point (the "Type something." row)."""

    gate: str          # flow screen that asked: "scope" | "plan" | "approval"
    text: str
    operator: str
    created_at: datetime = field(default_factory=utc_now)
