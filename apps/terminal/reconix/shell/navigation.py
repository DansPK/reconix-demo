"""Moving through the screen flow: ←/→, the Alt+1–8 jumps, goto() and rebuilding a screen."""

from typing import List, Optional, Tuple

from .. import store
from ..flow import screen_for
from ..models import GATE_APPROVAL_PREFIX, GATE_PLAN, GATE_TEMPLATE
from ..screens import (
    ApprovalScreen, ExecutionScreen, FindingDetailScreen, FindingsListScreen, PlanScreen,
    ReportScreen, StartScreen, TemplateScreen,
)
from ..widgets.plan_order import PlanOrder
from ..widgets.step_chat import StepChat
from ..widgets.tick_list import TickList

# Ordered flow — left/right arrows and Enter walk through this sequence.
FLOW = [
    ("start",     StartScreen),
    ("template",  TemplateScreen),
    ("plan",      PlanScreen),
    ("approval",  ApprovalScreen),
    ("execution", ExecutionScreen),
    ("findings",  FindingsListScreen),
    ("detail",    FindingDetailScreen),
    ("report",    ReportScreen),
]
FLOW_ORDER = [name for name, _ in FLOW]
FLOW_CLASSES = {name: cls for name, cls in FLOW}

# ←/→ never leave a screen while one of these is open on it: the chat, a tick list of scope
# changes or the plan's order list would be thrown away unsaved.
OPEN_PANELS = (StepChat, TickList, PlanOrder)
PANEL_OPEN = "Esc closes the chat first."
# ← on the first screen and → on the last say so, instead of doing nothing.
FIRST_STEP = "This is the first step."
LAST_STEP = "This is the last step."


def _gate_names(gate: str) -> Tuple[str, str]:
    """`gate` as words, and how to come back to it: one list for both hints below."""
    if gate == GATE_TEMPLATE:
        return "The template choice", "Alt+2 to come back"
    if gate == GATE_PLAN:
        return "The plan", "Alt+3 or /plan"
    if gate.startswith(GATE_APPROVAL_PREFIX):
        return "The approval", "Alt+4 or /approval"
    if screen_for(gate) == "execution":
        return "The target login", "Alt+5 or /status"
    return "The scope", "Alt+2 to come back"


def gate_hint(gate: str) -> str:
    """How to come back to `gate` after ← left it waiting (nothing was decided)."""
    what, back = _gate_names(gate)
    return f"{what} still waits for you — {back}."


def gate_blocks(gate: str) -> str:
    """Why → stays on a gate that still waits: it is decided first (← still goes back)."""
    what, _ = _gate_names(gate)
    return f"{what} still waits for your choice — decide it first (← goes back)."


class NavigationMixin:
    """Mixed into ReconixApp. `_index` is the position of the shown screen in FLOW_ORDER."""

    _index: int = 0

    def flow_order(self) -> List[str]:
        """Screen keys in flow order (the one source of truth is FLOW)."""
        return list(FLOW_ORDER)

    @property
    def current_flow(self) -> str:
        return FLOW_ORDER[self._index]

    def can_enter_execution(self) -> bool:
        """Execution shows a run that has started: only after the plan was run."""
        return store.is_plan_started()

    def _show(self, index: int) -> None:
        index = max(0, min(index, len(FLOW_ORDER) - 1))
        name = FLOW_ORDER[index]
        if name == "execution" and not self.can_enter_execution():
            self.notify("Execution starts after you run the plan (Alt+3 or /plan).",
                        severity="warning")
            return
        self._index = index
        if len(self.screen_stack) > 2:         # dialogs on top: close them, never switch
            while len(self.screen_stack) > 2:  #   a dialog out from under itself
                self.pop_screen()
            self.dialogs_dropped()
        self.switch_screen(FLOW_CLASSES[name]())

    def _skipped(self, name: str) -> bool:
        """A screen ←/→ step over: Execution until the plan has run, and Finding detail
        while no finding is chosen (it would only say "no finding selected")."""
        if name == "execution":
            return not self.can_enter_execution()
        if name == "detail":
            return not getattr(self, "selected_finding", "")
        return False

    def _neighbour(self, delta: int) -> Optional[int]:
        """The previous / next screen's index, stepping over screens with nothing to show;
        None at either end of the flow."""
        index = self._index + delta
        while 0 <= index < len(FLOW_ORDER) and self._skipped(FLOW_ORDER[index]):
            index += delta
        return index if 0 <= index < len(FLOW_ORDER) else None

    def _step(self, delta: int) -> None:
        """←/→: the neighbouring screen, stepping over screens with nothing to show."""
        index = self._neighbour(delta)
        if index is not None:
            self._show(index)

    def _gate_here(self) -> str:
        """The gate that still waits on the shown screen ("" when none does)."""
        gate = store.waiting_gate()
        if (gate and not store.is_finished() and store.gate_state(gate) == "pending"
                and screen_for(gate) == self.current_flow):
            return gate
        return ""

    def _arrow(self, delta: int) -> None:
        """The ←/→ keys: like `_step`, but never away from an open chat, tick list or order
        list, never forward past a gate that still waits (← goes back, with a hint how to
        return; they decide nothing), and saying so at either end of the flow."""
        if any(self.screen.query(panel) for panel in OPEN_PANELS):
            self.notify(PANEL_OPEN, timeout=3)
            return
        gate = self._gate_here()
        if gate and delta > 0:
            self.notify(gate_blocks(gate), timeout=4)
            return
        if self._neighbour(delta) is None:
            self.notify(FIRST_STEP if delta < 0 else LAST_STEP, timeout=3)
            return
        before = self._index
        self._step(delta)
        if gate and self._index != before:
            self.notify(gate_hint(gate), timeout=4)

    def go_next(self) -> None:
        self._step(1)

    def go_prev(self) -> None:
        self._step(-1)

    def goto(self, name: str) -> None:
        if name in FLOW_ORDER:
            self._show(FLOW_ORDER.index(name))

    def reload_screen(self) -> None:
        """Rebuild the shown screen from the store (its layout depends on the run's state)."""
        self._show(self._index)

    def open_dialog(self, dialog, callback=None) -> None:
        """Push a dialog from the app's own message loop.

        Textual returns a dialog's result to whatever was handling a message when it was
        pushed. A flow screen can be replaced meanwhile (the run moved on), so the app
        pushes its dialogs itself and the result always comes back to the app.
        """
        self.call_later(self.push_screen, dialog, callback)

    # --- key actions --------------------------------------------------------------------------
    def action_nav_next(self) -> None:
        self._arrow(1)

    def action_nav_prev(self) -> None:
        self._arrow(-1)

    def action_jump(self, name: str) -> None:
        self.goto(name)
