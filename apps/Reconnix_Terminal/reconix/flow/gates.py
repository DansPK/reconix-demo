"""Which flow screen decides each gate the run stops at.

The template and scope gates are decided on the Template screen, the plan gate on the
Plan screen and every approval gate on the Approval screen. The target login and the
one-time code after it are decided in a form over the current screen (`is_form_gate`).
"""

from ..models import (
    GATE_ACCOUNT, GATE_APPROVAL_PREFIX, GATE_CODE, GATE_PLAN, GATE_SCOPE, GATE_TEMPLATE,
)

GATE_SCREENS = {
    GATE_TEMPLATE: "template",
    GATE_SCOPE: "template",
    GATE_PLAN: "plan",
    GATE_ACCOUNT: "execution",
    GATE_CODE: "execution",
}


def screen_for(gate: str) -> str:
    """The flow screen for `gate` ("" for no gate)."""
    if gate.startswith(GATE_APPROVAL_PREFIX):
        return "approval"
    return GATE_SCREENS.get(gate, "")


def is_form_gate(gate: str) -> bool:
    """True for the gates decided in a pop-up form (the target login, its one-time code)."""
    return gate in (GATE_ACCOUNT, GATE_CODE)
