"""Where each step of the screen flow stands, read from the current run.

The flow line under the session bar shows these: "done" ✓, "stopped" ✕, "waiting" !
(the run is paused there for a human decision). Steps with no entry are pending.
"""

from typing import Dict

from ..models import (
    GATE_ACCOUNT, GATE_APPROVAL_PREFIX, GATE_CODE, GATE_PLAN, GATE_SCOPE, GATE_TEMPLATE,
)
from . import lists
from .approvals import list_approval_decisions


def step_states() -> Dict[str, str]:
    """{"template": "done", "approval": "waiting", ...} for steps with a settled state."""
    assessment = lists.current()
    run = assessment.run
    gate = run.waiting_gate
    states: Dict[str, str] = {}
    if run.started:
        states["start"] = "done"

    scope_ok = assessment.scope is not None and assessment.scope.status == "APPROVED"
    if scope_ok:
        states["template"] = "done"
    elif run.stopped:
        states["template"] = "stopped"
    elif gate in (GATE_TEMPLATE, GATE_SCOPE):
        states["template"] = "waiting"

    if run.plan_started:
        states["plan"] = "done"
    elif gate == GATE_PLAN and not run.stopped:
        states["plan"] = "waiting"

    decisions = list_approval_decisions()
    if any(d.decision == "REJECTED" for d in decisions):
        states["approval"] = "stopped"
    elif gate.startswith(GATE_APPROVAL_PREFIX) and not run.stopped:
        states["approval"] = "waiting"
    elif assessment.approvals and len(decisions) >= len(assessment.approvals):
        states["approval"] = "done"

    if run.completed:
        states["execution"] = "done"
    elif run.stopped and run.plan_started:
        states["execution"] = "stopped"
    elif gate in (GATE_ACCOUNT, GATE_CODE) and not run.stopped:
        states["execution"] = "waiting"

    if run.report_path:
        states["report"] = "done"
    return states
