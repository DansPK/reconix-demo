"""Approval of gated actions: MEDIUM needs a decision; HIGH a second confirmation too.

These checks are the authority. The approval dialogs may pre-check for a nicer
experience, but nothing is approved unless `approve()` accepts it.
"""

import hashlib
import secrets
from typing import List, Optional

from ..models import (
    GATE_APPROVAL_PREFIX, GATE_PLAN, ApprovalDecision, ApprovalRequest, Confirmation,
)
from . import lists
from .activity import current_operator, log_event
from .errors import StoreValidationError
from .scope import check_request, policy_reason
from .transcript import add_activity

MAX_PARAM_LENGTH = 200
# What each editable parameter must look like before the policy engine sees it.
_PARAM_SHAPES = {
    "Path": (lambda v: v.startswith("/"), "Give a path on the target, e.g. /api/orders/10483."),
    "Host:port": (lambda v: ":" in v, "Give a host and a port, e.g. 10.0.0.1:8443."),
    "File": (lambda v: not v.startswith(("/", "~", "\\")),
             "Give a file in the repository, e.g. app/config/settings.py."),
}


def command_digest(command: str) -> str:
    """The hash an approval is bound to; `approve()` re-computes and compares it."""
    return "sha256:" + hashlib.sha256(command.encode("utf-8")).hexdigest()


def get_approval(request_id: str) -> ApprovalRequest:
    for request in lists.current().approvals:
        if request.request_id == request_id:
            return request
    raise StoreValidationError(f"Unknown approval request {request_id}.")


def needs_confirmation(request_id: str) -> bool:
    """HIGH-risk actions need the double check: the single-use confirmation token."""
    return get_approval(request_id).risk == "HIGH"


def decision_for(request_id: str) -> Optional[ApprovalDecision]:
    for decision in reversed(lists.current().decisions):
        if decision.request_id == request_id:
            return decision
    return None


def is_approved(request_id: str) -> bool:
    decision = decision_for(request_id)
    return decision is not None and decision.decision == "APPROVED"


def list_approval_decisions() -> List[ApprovalDecision]:
    return list(lists.current().decisions)


def approvals_count() -> int:
    return sum(1 for d in lists.current().decisions if d.decision == "APPROVED")


# --- checks shared by approve / reject --------------------------------------------------
def _pending(request_id: str) -> ApprovalRequest:
    """The request, if the run is waiting on it and nobody has decided yet."""
    request = get_approval(request_id)
    if lists.current().run.waiting_gate != GATE_APPROVAL_PREFIX + request_id:
        raise StoreValidationError("This action isn't waiting for a decision.")
    if decision_for(request_id) is not None:
        raise StoreValidationError("This action was already decided.")
    return request


def _check_hash(request: ApprovalRequest, command_hash: str) -> None:
    """The operator saw this exact request, and it hasn't changed since."""
    if not secrets.compare_digest(command_hash, request.command_hash):
        raise StoreValidationError("This approval is for a different request.")
    if command_digest(request.command) != request.command_hash:
        raise StoreValidationError("The request changed after it was shown. Review it again.")


# --- "Edit params": where a gated action runs, changed before it is decided ---------------
def can_edit(request_id: str) -> bool:
    """True when the operator may edit this action right now (see `edit_approval`)."""
    request = get_approval(request_id)
    gate = lists.current().run.waiting_gate
    return (bool(request.param_label) and decision_for(request_id) is None
            and gate in (GATE_PLAN, GATE_APPROVAL_PREFIX + request_id))


def edit_approval(request_id: str, value: str) -> ApprovalRequest:
    """Change where an undecided gated action runs (its path, host:port or file).

    Only while the run waits at the plan or at this action's gate. The policy engine must
    allow the new value. The target, the exact command and its hash are rebuilt, and any
    open HIGH confirmation is voided, so the operator approves exactly what is shown next.
    Risk, method and the gates don't change.
    """
    request = get_approval(request_id)
    if not request.param_label:
        raise StoreValidationError("This action has nothing to edit.")
    if decision_for(request_id) is not None:
        raise StoreValidationError("This action was already decided.")
    if not can_edit(request_id):
        raise StoreValidationError(
            "Edit an action on the plan, or when Reconix asks you to approve it.")
    label = request.param_label.lower()
    value = (value or "").strip()
    if not value:
        raise StoreValidationError(f"Enter the {label}.")
    if len(value) > MAX_PARAM_LENGTH or any(c.isspace() or ord(c) < 32 or ord(c) == 127
                                            for c in value):
        raise StoreValidationError(f"That {label} can't be used: one value, no spaces, "
                                   f"at most {MAX_PARAM_LENGTH} characters.")
    shape = _PARAM_SHAPES.get(request.param_label)
    if shape and not shape[0](value):
        raise StoreValidationError(shape[1])
    reason = policy_reason(request.method, value)
    if reason:
        log_event("approval.edit_refused", f"{request_id} · {value} · {reason}")
        raise StoreValidationError(f"Blocked by policy: {reason}.")
    old = request.path
    if value == old:
        return request
    request.path = value
    request.target = request.target_pattern.replace("{path}", value)
    request.command = request.command_pattern.replace("{path}", value)
    request.command_hash = command_digest(request.command)
    for confirmation in lists.current().confirmations:     # approve what is shown next
        if confirmation.request_id == request_id:
            confirmation.used = True
    add_activity("USER", f"Edited {request.action}: {old} → {value}", tone="warn")
    log_event("approval.edited", f"{request_id} · {old} → {value}")
    return request


# --- the HIGH-risk second step ----------------------------------------------------------
def request_confirmation(request_id: str, command_hash: str) -> str:
    """Open the confirmation step of a HIGH-risk approval; returns a single-use token."""
    request = _pending(request_id)
    _check_hash(request, command_hash)
    if request.risk != "HIGH":
        raise StoreValidationError("Only HIGH-risk actions need a confirmation step.")
    confirmations = lists.current().confirmations
    for confirmation in confirmations:            # one live token per request
        if confirmation.request_id == request_id:
            confirmation.used = True
    token = secrets.token_hex(16)
    confirmations.append(Confirmation(request_id=request_id, token=token))
    log_event("approval.confirmation_requested", request_id)
    return token


def decline_confirmation(request_id: str) -> None:
    """The operator left the confirmation step without approving: void open tokens."""
    get_approval(request_id)
    voided = False
    for confirmation in lists.current().confirmations:
        if confirmation.request_id == request_id and not confirmation.used:
            confirmation.used = True
            voided = True
    if voided:
        log_event("approval.confirmation_declined", request_id)


def _consume_token(request_id: str, token: Optional[str]) -> None:
    for confirmation in lists.current().confirmations:
        if (confirmation.request_id == request_id and not confirmation.used
                and secrets.compare_digest(confirmation.token, token or "")):
            confirmation.used = True
            return
    raise StoreValidationError("HIGH-risk actions need the confirmation step first.")


# --- decisions -----------------------------------------------------------------------------
def approve(
    request_id: str, *, command_hash: str, confirmation_token: Optional[str] = None,
) -> ApprovalDecision:
    """Record an approval, or raise StoreValidationError if any check fails.

    `command_hash` binds the approval to the exact request the operator saw. HIGH risk
    also needs the double check: an unused token from `request_confirmation()`, which
    the operator gets only by asking to approve and then confirming once more. The
    policy check runs before the decision is recorded, and the token is spent only when
    everything else is valid, so a blocked request doesn't burn it.
    """
    request = _pending(request_id)
    _check_hash(request, command_hash)
    # The policy engine decides before the human decision is recorded.
    verdict = check_request(request.method, request.path)
    if not verdict.allowed:
        raise StoreValidationError(f"Blocked by policy: {verdict.reason}.")
    if request.risk == "HIGH":
        _consume_token(request_id, confirmation_token)
    decision = ApprovalDecision(
        request_id=request_id, decision="APPROVED", operator=current_operator(),
        command_hash=request.command_hash,
    )
    lists.current().decisions.append(decision)
    detail = " (double-checked)" if request.risk == "HIGH" else ""
    add_activity("USER", f"Approved: {request.action}{detail}", tone="ok")
    log_event("approval.approved", f"{request_id} {request.command_hash}")
    return decision


def reject(request_id: str) -> ApprovalDecision:
    request = _pending(request_id)
    decline_confirmation(request_id)
    decision = ApprovalDecision(
        request_id=request_id, decision="REJECTED", operator=current_operator(),
        command_hash=request.command_hash,
    )
    lists.current().decisions.append(decision)
    add_activity("USER", f"Rejected: {request.action}", tone="block")
    log_event("approval.rejected", request_id)
    return decision
