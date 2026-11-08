"""Hosting the assessment run: the controller plays it; the app redraws and routes gates.

The controller holds no data: it asks the store for the next step and, when the run stops
at a gate, asks this host to open it. A gate opens the flow screen that decides it (the
target login opens a form instead). If a dialog is open at that moment, the gate waits
until the dialog closes, so a pop-up is never pulled out from under the operator.
"""

from typing import Optional

from textual.actions import SkipAction
from textual.widgets import Input

from .. import store
from ..flow import RunController, is_form_gate, screen_for
from ..models import GATE_SCOPE, Choice
from ..screens.base import ReconixScreen
from ..screens.choice import ChoiceScreen
from ..screens.forms import LoginForm


class RunHostMixin:
    """Mixed into ReconixApp; implements `flow.RunHost` (with App.set_timer)."""

    def _init_run_host(self) -> None:
        self.controller = RunController(self)
        self._deferred_gate = ""      # a gate that arrived while a dialog was open
        self._login_open = False      # the login form is open (or about to open)
        self._save_warned = False     # warn about a failed save once, not on every step
        self._api_spec_offered_for = None   # the assessment whose spec form we auto-opened

    # --- RunHost: what the controller calls -------------------------------------------------
    def refresh_view(self) -> None:
        screen = self.flow_screen()
        if screen is not None:
            screen.refresh_view()
        self._save()

    def open_gate(self, gate: str) -> None:
        """Show what decides `gate`, if the run is really waiting there right now."""
        if not self.waiting_at(gate) or self._login_open:
            return
        if not isinstance(self.screen, ReconixScreen):
            self._deferred_gate = gate        # a dialog is open: when it closes
            return
        self._deferred_gate = ""
        store.flush_saves()      # paused at a gate: let the background write land (no UI stall here)
        if is_form_gate(gate):
            self._login_open = True
            self.open_dialog(LoginForm(), self._login_closed)
            return
        target = screen_for(gate)
        if target and self.current_flow != target:
            self.goto(target)
        if gate == GATE_SCOPE:
            self._offer_api_spec()

    def _offer_api_spec(self) -> None:
        """On the API template's scope gate, open its base URL and spec form once (Cancel
        skips it).

        Only for the API template, only while a spec can still be attached, and only once per
        assessment — so cancelling, or attaching then removing, never reopens it. Replace and
        Remove stay in the Scope menu.
        """
        assessment = store.get_assessment()
        if self._api_spec_offered_for is assessment:
            return
        if store.get_api_spec() is not None or not store.can_attach_api_spec():
            return
        self._api_spec_offered_for = assessment
        self.attach_api_spec()              # opens OpenApiForm via open_dialog (ActionsMixin)

    def run_finished(self) -> None:
        self.refresh_view()
        store.flush_saves()      # the run ended: make sure the final copy is on disk
        if store.is_completed():
            self.notify(f"Assessment complete. Findings: {len(store.list_findings())} · "
                        "report and exports: Alt+8.", title="Reconix")

    def run_failed(self, message: str) -> None:
        store.flush_saves()      # the run stopped: persist the final state
        self.notify(message, title="The run stopped", severity="error", markup=False)

    # --- helpers for screens and actions -----------------------------------------------------
    def flow_screen(self) -> Optional[ReconixScreen]:
        """The flow screen on top of the stack (it may sit under a dialog)."""
        for screen in reversed(self.screen_stack):
            if isinstance(screen, ReconixScreen):
                return screen
        return None

    def waiting_at(self, gate: str) -> bool:
        """The run waits at `gate` for a decision and no steps are queued (a decided gate
        can linger in `waiting_gate` until the controller's next step plays)."""
        return (bool(gate) and store.waiting_gate() == gate and not store.is_finished()
                and store.gate_state(gate) == "pending" and not self.controller.busy)

    def flow_screen_resumed(self) -> None:
        """A flow screen is on top again (a dialog closed): open a gate that waited."""
        if self._deferred_gate:
            self.open_gate(self._deferred_gate)

    def dialogs_dropped(self) -> None:
        """Dialogs were closed without a decision (the app moved to another screen)."""
        self._login_open = False
        self._deferred_gate = ""

    def resume_run(self) -> None:
        """A decision was recorded: redraw and play on to the next gate or the end."""
        self.refresh_view()
        self.controller.resume()

    def gate_decided(self, then: str) -> None:
        """After a decision on a gate screen: show `then` and play on."""
        self.goto(then)
        self.resume_run()

    def _login_closed(self, result: Optional[str]) -> None:
        self._login_open = False
        if result == "saved":
            self.resume_run()
            return
        self.refresh_view()
        self.notify("Nothing runs until you finish the sign-in. Press Enter on Execution (Alt+5) "
                    "to continue.", title="Paused")

    # --- stopping the run: Ctrl+C on any flow screen, /stop ------------------------------------
    def action_stop_assessment(self) -> None:
        """Ctrl+C: stop the running assessment (it asks first), on every flow screen.

        Left to the next binding (SkipAction): inside a dialog or the help, and in a field
        with selected text (Ctrl+C copies it)."""
        if not isinstance(self.screen, ReconixScreen):
            raise SkipAction()
        focused = self.focused
        if isinstance(focused, Input) and focused.selected_text:
            raise SkipAction()
        self.confirm_stop()

    def confirm_stop(self) -> None:
        """Ask "Stop this assessment?"; "Stop now" stops it through the store (`stop_run`).
        With no run in progress it only says so."""
        if not store.get_run().started or store.is_finished():
            self.notify("No assessment is running. Ctrl+Q quits Reconix.", title="Stop")
            return

        def answer(choice: Optional[str]) -> None:
            if choice == "stop":
                self.stop_run()

        self.open_dialog(ChoiceScreen(
            "Stop the run", "Stop this assessment?",
            [
                Choice("keep", "Keep running", "Let the plan finish."),
                Choice("stop", "Stop now", "Nothing else runs; findings so far are kept.",
                       "danger"),
            ],
            chip="Assessment", danger=True,
        ), answer)

    def _save(self) -> None:
        """Keep the saved copy the web dashboard reads in step (the store skips no-ops).

        The snapshot is built here but written on a background thread (`autosave_async`), so a
        slow disk never stalls the run. A failed write is reported once, a step later."""
        store.autosave_async()
        if store.save_failed() and not self._save_warned:
            self._save_warned = True
            self.notify("Couldn't save this assessment for the web dashboard. Check that "
                        "~/.reconix/assessments is writable.", title="Not saved",
                        severity="warning")
