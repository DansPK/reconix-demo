"""What a line typed on "Type something." at the Scope or Plan step means.

Reconix reads the line as a question (ANSWER), a scope change (SCOPE_EDIT) or a plan change
(PLAN_EDIT). The store still validates every change before anything moves
(`store.apply_scope_changes`, `store.redraft_plan`), and the operator still approves.
"""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass(frozen=True)
class ScopeChanges:
    """The changes proposed to the draft scope. Empty lists and None change nothing."""

    target: Optional[str] = None
    add_tools: List[str] = field(default_factory=list)
    remove_tools: List[str] = field(default_factory=list)
    add_ports: List[int] = field(default_factory=list)
    remove_ports: List[int] = field(default_factory=list)
    add_excluded: List[str] = field(default_factory=list)
    remove_excluded: List[str] = field(default_factory=list)
    allowed_methods: Optional[List[str]] = None
    time_limit_minutes: Optional[int] = None


@dataclass(frozen=True)
class EditIntent:
    """How the line reads: the intent, the reply text, and the change for that intent."""

    intent: str  # ANSWER | SCOPE_EDIT | PLAN_EDIT
    answer: str = ""
    scope_changes: Optional[ScopeChanges] = None  # SCOPE_EDIT only
    plan_feedback: str = ""  # PLAN_EDIT only
