"""Audit trail and operator feedback: record and list what the operator did and said."""

from typing import List

from ..models import AuditEvent, Feedback
from . import lists
from .errors import StoreValidationError


def current_operator() -> str:
    return lists.current().operator


def log_event(kind: str, detail: str = "") -> AuditEvent:
    """Append an audit event such as `scope.approved` or `report.export_requested`."""
    kind = kind.strip()
    if not kind:
        raise StoreValidationError("Event kind is required.")
    event = AuditEvent(kind=kind, operator=current_operator(), detail=detail.strip())
    lists.EVENTS.append(event)
    return event


def list_events() -> List[AuditEvent]:
    return list(lists.EVENTS)


MAX_FEEDBACK_LENGTH = 500


def add_feedback(gate: str, text: str) -> Feedback:
    """Save free text typed at a question (the "Type something." answer)."""
    text = " ".join(text.split())
    if not text:
        raise StoreValidationError("Type some feedback first.")
    if len(text) > MAX_FEEDBACK_LENGTH:
        raise StoreValidationError(f"Keep feedback under {MAX_FEEDBACK_LENGTH} characters.")
    feedback = Feedback(gate=gate, text=text, operator=current_operator())
    lists.FEEDBACK.append(feedback)
    log_event(f"{gate}.feedback", text)
    return feedback


def list_feedback() -> List[Feedback]:
    return list(lists.FEEDBACK)

