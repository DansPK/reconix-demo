"""Moving through the screen flow: ←/→, the 1–8 jumps, goto() and rebuilding a screen."""

from typing import List

from .. import store
from ..screens import (
    ApprovalScreen, ExecutionScreen, FindingDetailScreen, FindingsListScreen, PlanScreen,
    ReportScreen, StartScreen, TemplateScreen,
)

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
            self.notify("Execution starts after you run the plan (3 or /plan).",
                        severity="warning")
            return
        self._index = index
        if len(self.screen_stack) > 2:         # dialogs on top: close them, never switch
            while len(self.screen_stack) > 2:  #   a dialog out from under itself
                self.pop_screen()
            self.dialogs_dropped()
        self.switch_screen(FLOW_CLASSES[name]())

    def _step(self, delta: int) -> None:
        """←/→: the neighbouring screen, stepping over Execution until the plan has run."""
        index = self._index + delta
        if 0 <= index < len(FLOW_ORDER) and FLOW_ORDER[index] == "execution" \
                and not self.can_enter_execution():
            index += delta
        if 0 <= index < len(FLOW_ORDER):
            self._show(index)

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
        self.go_next()

    def action_nav_prev(self) -> None:
        self.go_prev()

    def action_jump(self, name: str) -> None:
        self.goto(name)
