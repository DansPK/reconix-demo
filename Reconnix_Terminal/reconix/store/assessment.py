"""The current assessment, the operator's typed requests, and the session's assessments."""

from dataclasses import dataclass
from typing import List

from ..models import Assessment, UserRequest
from . import lists
from .activity import log_event
from .errors import StoreValidationError

MAX_REQUEST_LENGTH = 500


def get_assessment() -> Assessment:
    return lists.current()


def assessment_label() -> str:
    """The assessment id once the scope is approved, else ""."""
    return get_assessment().assessment_id


# --- the session's assessments (create, list, reopen) -----------------------------------------
@dataclass
class AssessmentCard:
    """One row in the assessments list."""

    index: int
    label: str
    target: str
    template: str
    status: str          # New | Running | Awaiting input | Completed | Stopped
    findings: int
    current: bool


def assessment_status(assessment: Assessment) -> str:
    run = assessment.run
    if run.stopped:
        return "Stopped"
    if run.completed:
        return "Completed"
    if not run.started:
        return "New"
    if run.waiting_gate:
        return "Awaiting input"
    return "Running"


def list_assessments() -> List[AssessmentCard]:
    from .templates import template_name
    current_index = lists.CURRENT[0]
    cards = []
    for index, assessment in enumerate(lists.ASSESSMENTS):
        revealed = set(assessment.run.revealed)
        cards.append(AssessmentCard(
            index=index, label=assessment.label, target=assessment.target or "—",
            template=template_name(assessment.template_id) if assessment.template_id else "—",
            status=assessment_status(assessment),
            findings=sum(1 for f in assessment.findings if f.fid in revealed),
            current=index == current_index,
        ))
    return cards


def switch_assessment(index: int) -> None:
    """Make another assessment the current one (reopen a past one)."""
    from .persist import autosave       # (imported here: persist depends on this module)

    autosave()                          # keep the one we leave up to date on disk
    try:
        lists.set_current(index)
    except IndexError:
        raise StoreValidationError("No such assessment.") from None
    log_event("assessment.switched", lists.current().label)


def list_requests() -> List[UserRequest]:
    return list(lists.current().requests)


def clean_request(text: str) -> str:
    """A typed line with its whitespace folded; raises if it is empty or too long."""
    text = " ".join(text.split())
    if not text:
        raise StoreValidationError("Type a request first.")
    if len(text) > MAX_REQUEST_LENGTH:
        raise StoreValidationError(f"Keep the request under {MAX_REQUEST_LENGTH} characters.")
    return text


def add_request(text: str) -> UserRequest:
    """Store a plain-language request typed at the prompt."""
    request = UserRequest(clean_request(text))
    lists.current().requests.append(request)
    log_event("request.submitted", request.text)
    return request
