"""How each run phase is shown: its label, chip tone, and whether it is busy."""

from typing import NamedTuple


class PhaseStyle(NamedTuple):
    label: str
    tone: str        # a theme.CHIP tone
    busy: bool       # shows the ⠿ activity glyph


PHASES = {
    "planning":          PhaseStyle("Planning", "cyan", True),
    "scope_pending":     PhaseStyle("Scope pending approval", "amber", False),
    "plan_pending":      PhaseStyle("Plan ready to run", "amber", False),
    "testing":           PhaseStyle("Testing", "cyan", True),
    "waiting_account":   PhaseStyle("Waiting for login", "amber", False),
    "validating":        PhaseStyle("Validating", "cyan", True),
    "awaiting_approval": PhaseStyle("Awaiting approval", "amber", False),
    "analyzing":         PhaseStyle("Analyzing", "cyan", True),
    "completed":         PhaseStyle("Completed", "green", False),
    "stopped":           PhaseStyle("Stopped", "red", False),
}


def phase_style(phase: str) -> PhaseStyle:
    return PHASES.get(phase, PhaseStyle(phase.replace("_", " ").capitalize(), "muted", False))
