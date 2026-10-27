"""Approval requests for gated actions, and the records of each decision."""

from dataclasses import dataclass, field
from datetime import datetime

from .base import utc_now


@dataclass
class ApprovalRequest:
    """An action the AI proposed that the policy engine holds for a human decision."""

    request_id: str
    risk: str          # "MEDIUM" | "HIGH"
    action: str        # e.g. "Baseline request (read-only)" or "limited_validation"
    target: str        # what the dialog shows, e.g. "GET /api/orders/10482"
    method: str        # what the policy check sees: method + path
    path: str
    purpose: str
    impact: str
    command: str       # the exact request that will run
    command_hash: str  # sha256 of `command`; binds the approval to that request
    # "Edit params": the one value the operator may change (where the action runs) and the
    # patterns `target` and `command` are rebuilt from ("{path}" is the value). Store-only:
    # not in the saved copy or the reports.
    param_label: str = ""      # "Path" | "Host:port" | "File"; "" = nothing to edit
    target_pattern: str = ""
    command_pattern: str = ""


@dataclass
class ApprovalDecision:
    request_id: str
    decision: str      # "APPROVED" | "REJECTED"
    operator: str
    command_hash: str
    reason: str = ""   # no longer asked (HIGH is double-checked); older saved copies have one
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class Confirmation:
    """Single-use token for the second step of a HIGH-risk approval."""

    request_id: str
    token: str
    used: bool = False
    created_at: datetime = field(default_factory=utc_now)
