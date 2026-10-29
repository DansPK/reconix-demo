"""Starting, deciding and leaving assessments: what the screens and commands ask the app to do.

Every decision goes through the store, which validates it and raises
`StoreValidationError` when it isn't allowed; the app shows that message and changes
nothing else. After a decision the run plays on (`resume_run`).
"""

from typing import Optional

from .. import store
from ..flow import screen_for
from ..models import Choice
from ..screens.choice import ChoiceScreen
from ..screens.forms import ApprovalEditForm, OpenApiForm, ScopeEditForm


class ActionsMixin:
    """Mixed into ReconixApp."""

    def _warn(self, exc: Exception) -> None:
        self.notify(str(exc), severity="warning", markup=False)

    def _remember(self, text: str) -> None:
        try:
            store.add_history(text)
        except store.StoreValidationError:
            pass   # history is best-effort; the action itself already succeeded

    # --- the start prompt --------------------------------------------------------------------
    def submit_request(self, text: str) -> bool:
        """A line typed at the Start prompt. True when it was accepted (the prompt clears).

        Before a run, a target starts the run (an empty line uses the demo request) and
        anything else gets a short answer. During a run the line goes to the assistant;
        an empty line reopens what the run waits for. After the run has finished
        (completed or stopped) every line is still a chat turn about that same assessment,
        with its history and context; an empty line opens Findings (or Report when there are
        none). A new assessment starts only with /new or /template.
        """
        text = text.strip()
        run = store.get_run()
        if run.started:
            if not text:
                if store.is_finished():
                    self.goto("findings" if store.list_findings() else "report")
                else:
                    self.goto(self.resume_screen_name())
                return True
            try:
                answer = store.say_operator_line(text)
            except store.StoreValidationError as exc:
                self._warn(exc)
                return False
            self._remember(text)
            self.refresh_view()                         # the operator line shows at once
            store.llm_answer(answer)                     # built-in canned reply, instant
            self.refresh_view()
            return True
        try:
            result = store.submit_prompt(text or store.DEMO_REQUEST)
        except store.StoreValidationError as exc:
            self._warn(exc)
            return False
        if text:
            self._remember(text)
        self.refresh_view()
        if result == "started":
            self.controller.resume()
        return True

    # --- template and scope (the Template screen) --------------------------------------------
    def open_template(self, template_id: Optional[str] = None) -> None:
        """`/template`: the Template screen; a fresh assessment if the current one is past it."""
        run = store.get_run()
        if run.started and (store.is_scope_approved() or run.stopped):
            self.controller.stop()
            store.new_assessment()
            self.notify("Started a new assessment. The previous one is under /assessments.")
        self.template_pick = template_id if not store.get_run().started else None
        self.goto("template")

    def start_with_template(self, text: str, template_id: str) -> None:
        """The target typed for a picked template: start the run on it."""
        if store.get_run().started:
            self.controller.stop()
            store.new_assessment()
        try:
            store.start_run(text, template_id)
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        self._remember(text)
        self.resume_run()

    def choose_template(self, template_id: str) -> None:
        try:
            store.select_template(template_id)
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        self.resume_run()

    def approve_scope(self) -> None:
        try:
            store.approve_scope()
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        self.resume_run()

    def edit_scope(self) -> None:
        self.open_dialog(ScopeEditForm(), lambda _result: self.refresh_view())

    def attach_api_spec(self) -> None:
        """The API template's form: its base URL and an OpenAPI spec (a file or a URL on the
        API's host); the store validates and reads them."""
        self.open_dialog(OpenApiForm(), lambda _result: self.refresh_view())

    def remove_api_spec(self) -> None:
        """Detach the OpenAPI file: the template's endpoints and methods come back."""
        try:
            store.remove_api_spec()
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        self.notify("OpenAPI spec removed.", title="OpenAPI", markup=False)
        self.refresh_view()

    # --- editing where a gated action runs ("Edit params", the plan's "Edit steps") --------
    def edit_approval(self, request_id: str) -> None:
        if not store.can_edit(request_id):
            self.notify("This action can't be edited now.", severity="warning")
            return
        self.open_dialog(ApprovalEditForm(request_id), lambda _result: self.refresh_view())

    def edit_plan_steps(self) -> None:
        """Ask which gated action to edit, then open its form."""
        choices = [
            Choice(request.request_id, request.action,
                   f"{request.risk} · {request.param_label}: {request.path}")
            for request in store.get_assessment().approvals
            if store.can_edit(request.request_id)
        ]
        if not choices:
            self.notify("No step can be edited now.", severity="warning")
            return
        choices.append(Choice("back", "Back to the plan", "Nothing changes."))
        dialog = ChoiceScreen("✎ EDIT STEPS", "Which gated step do you want to change?",
                              choices, default=len(choices) - 1, chip="Plan")
        self.open_dialog(dialog, self._plan_step_chosen)

    def _plan_step_chosen(self, answer: Optional[str]) -> None:
        if answer and answer != "back":
            self.edit_approval(answer)

    def reject_scope(self) -> None:
        try:
            store.reject_scope()
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        self.controller.stop()
        self.notify("Scope rejected — nothing was tested. Starting a new assessment.",
                    title="Scope")
        self.new_assessment()

    # --- the plan and the run ------------------------------------------------------------------
    def run_plan(self) -> None:
        try:
            store.run_plan()
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        self.gate_decided("execution")

    def stop_run(self) -> None:
        try:
            store.stop_run()
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        self.controller.stop()
        self.refresh_view()

    # --- assessments ----------------------------------------------------------------------------
    def new_assessment(self, target: Optional[str] = None) -> None:
        """Start over on a fresh assessment (earlier ones stay listed); optionally on `target`."""
        self.controller.stop()
        store.new_assessment()
        self.selected_finding = ""
        self.findings_filter = "all"
        self.goto("start")
        if target and target.strip():
            self.submit_request(target)

    def switch_assessment(self, index: int) -> None:
        """Reopen another assessment where it stands; a run that was playing plays on."""
        self.controller.stop()
        try:
            store.switch_assessment(index)
        except store.StoreValidationError as exc:
            self._warn(exc)
            return
        self.selected_finding = ""
        self.goto(self.resume_screen_name())
        gate = store.waiting_gate()
        if (store.get_run().started and not store.is_finished()
                and (not gate or store.gate_state(gate) != "pending")):
            self.controller.resume()

    def resume_screen_name(self) -> str:
        """The screen that shows where the current assessment stands."""
        run = store.get_run()
        if not run.started:
            return "start"
        gate = store.waiting_gate()
        if gate and not store.is_finished() and store.gate_state(gate) == "pending":
            return screen_for(gate)
        return "execution" if run.plan_started else "template"

    # --- findings and chat ------------------------------------------------------------------
    def open_finding(self, fid: str) -> None:
        self.selected_finding = fid
        self.goto("detail")

    def open_chat(self, draft: str = "") -> None:
        """Leave the current question and continue in the chat prompt."""
        self.pending_prompt = draft
        self.goto("start")
