"""The plan the operator reviews before running it: phases, the login, the gated actions.

Built from the current assessment (its template's plan tasks, the login its tools need, and
the approval requests its validation raises), with each row's status read live from the
run. Empty until a template is chosen.
"""

from typing import List

from ..models import GATE_ACCOUNT, GATE_APPROVAL_PREFIX, GATE_CODE, PlanRow, PlanTask
from . import lists
from .approvals import decision_for
from .run import plan_tasks
from .scope_view import join_and
from .vault import login_done, login_kind, login_tools

# What each phase does (the labels themselves are template-specific).
PHASE_DETAIL = {
    "discovery": "map the permitted surface",
    "scanning": "policy-checked checks on what discovery found",
    "validation": "limited validation of the candidates",
    "analysis": "merge duplicates · map to OWASP / CWE · score CVSS",
    "report": "executive summary + findings · export from the Report screen",
}
LOGIN_LABEL = {
    "cookie": "session cookie", "password": "test account",
    "password+otp": "test account, then a one-time code on its own",
}


def _login_row(num: str) -> PlanRow:
    run = lists.current().run
    if login_done():
        status = "done"
    elif run.waiting_gate in (GATE_ACCOUNT, GATE_CODE):
        status = "active"
    else:
        status = "pending"
    kind = login_kind()
    return PlanRow(num, "Target login", f"{LOGIN_LABEL.get(kind, kind)} for "
                   f"{join_and(login_tools())} · asked when testing needs it, "
                   "kept for this session only", "LOW", "login", status)


def _approval_rows(prefix: str) -> List[PlanRow]:
    rows = []
    run = lists.current().run
    for i, request in enumerate(lists.current().approvals):
        decision = decision_for(request.request_id)
        if decision is not None:
            status = "done" if decision.decision == "APPROVED" else "rejected"
        elif run.waiting_gate == GATE_APPROVAL_PREFIX + request.request_id:
            status = "active"
        else:
            status = "pending"
        rows.append(PlanRow(f"{prefix}{chr(ord('a') + i)}", request.action, request.purpose,
                            request.risk, "approve", status, command=request.command))
    return rows


def plan_overview() -> List[PlanRow]:
    """The plan as the Plan screen lists it (empty before a template is chosen)."""
    tasks: List[PlanTask] = plan_tasks()
    if not tasks:
        return []
    needs_login = bool(login_kind())
    rows: List[PlanRow] = []
    for n, task in enumerate(tasks, start=1):
        rows.append(PlanRow(str(n), task.label, PHASE_DETAIL.get(task.key, ""), "LOW", "auto",
                            task.status))
        if task.key == "scanning" and needs_login:
            rows.append(_login_row(f"{n}a"))
        if task.key == "validation":
            rows.extend(_approval_rows(str(n)))
    return rows


def gated_count() -> int:
    """How many planned actions wait for a human decision while the plan runs."""
    return len(lists.current().approvals)
