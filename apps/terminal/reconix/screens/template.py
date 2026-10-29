"""Frame 02 — Template: pick the kind of target, type it, and approve the drafted scope.

What the screen shows follows the run (see `state()`):

    pick      no assessment yet: choose a template, then type its target
    choose    the target fits several templates: the run waits for your pick
    busy      Reconix is drafting the scope manifest
    review    the scope gate: approve, edit or reject the manifest
    approved  the manifest is locked (next: the plan)
    stopped   the assessment stopped before testing (e.g. the scope was rejected)
"""

from typing import List, Optional

from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.widgets import Input, Label, Static

from .base import ReconixScreen
from .. import store, theme
from ..models import GATE_SCOPE, GATE_TEMPLATE, Choice
from ..widgets import (
    ActivityStatus, ChoiceMenu, Question, ScopeManifestView, UserMessage, menu_hint,
)

DRAFTING = "reconix is drafting the scope manifest…"


def _template_choices(suggested: str = "") -> List[Choice]:
    return [Choice(t.id, t.name, f"{t.description} · e.g. {t.example}",
                   recommended=(t.id == suggested), disabled=not t.available)
            for t in store.list_templates()]


def _ai_label(text: str) -> Static:
    return Static(Text.assemble(("◆ reconix ", theme.CYAN), (text, theme.DIM)),
                  classes="ai-label")


def _steps() -> List[str]:
    """What Reconix said since your latest line: the spinner's current and finished steps."""
    return [e.text for e in store.last_exchange()[1]]


def _request_message() -> List[UserMessage]:
    requests = store.list_requests()
    return [UserMessage(requests[-1].text)] if requests else []


class TemplateScreen(ReconixScreen):
    flow_name = "template"
    mode_name = "TEMPLATE"

    BINDINGS = [
        Binding("enter", "choose", "select", show=False),
        Binding("escape", "back", "back"),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._picked: Optional[str] = None     # "pick": the template chosen before the target

    # --- state -------------------------------------------------------------------------------
    @staticmethod
    def state() -> str:
        run = store.get_run()
        if not run.started:
            return "pick"
        if store.is_scope_approved():
            return "approved"
        if run.stopped:
            return "stopped"
        gate = store.waiting_gate()
        if gate == GATE_TEMPLATE and store.gate_state(gate) == "pending":
            return "choose"
        if gate == GATE_SCOPE and store.get_scope() is not None:
            return "review"
        return "busy"

    def view_state(self) -> object:
        # the review menu offers "Replace" and "Remove" once a spec is attached
        return (self.state(), store.get_api_spec() is not None)

    # --- layout ------------------------------------------------------------------------------
    def compose_body(self) -> ComposeResult:
        yield from getattr(self, f"_compose_{self.state()}")()

    def _compose_pick(self) -> ComposeResult:
        yield _ai_label("pick the kind of target, then type it · you approve the scope "
                        "before anything runs")
        yield Question("Template", "Which kind of target?", _template_choices(),
                       hint=menu_hint("go back"), typing=False, chat=False,
                       menu_id="template-menu")
        with Vertical(id="target-row") as row:
            row.display = False
            yield Label("", id="target-label", classes="field-label")
            yield Input(id="target")
            yield Static("", id="target-error")
            yield Static(Text("Enter to start · Esc to pick another template",
                              style=theme.DIM), classes="menu-hint")

    def _compose_choose(self) -> ComposeResult:
        assessment = store.get_assessment()
        yield from _request_message()
        yield _ai_label(f"target identified: {assessment.target} ({assessment.target_kind}) "
                        "· it fits more than one template")
        choices = _template_choices(assessment.template_id)
        default = next((i for i, c in enumerate(choices) if c.recommended), 0)
        yield Question("Template", "Which kind of target is it?", choices, default=default,
                       hint=menu_hint("decide later"), typing=False, menu_id="template-menu")

    def _compose_busy(self) -> ComposeResult:
        yield from _request_message()
        yield ActivityStatus(_steps(), DRAFTING, expanded=self.app.activity_expanded,
                             id="template-activity", classes="activity")

    def _manifest_panel(self, approved: bool) -> ComposeResult:
        with Vertical(classes="panel success" if approved else "panel accent") as panel:
            panel.border_title = "⛉ SCOPE"
            panel.border_subtitle = ("approved · locked" if approved
                                     else "draft · needs your approval")
            yield ScopeManifestView(store.get_scope(), classes="panel-body", id="manifest")
        yield Static(Text.assemble(("ℹ  ", theme.LOW), (
            "The agent can only act inside this manifest. Anything else is blocked before "
            "a tool runs.", theme.MUTED)), classes="panel-note")

    def _compose_review(self) -> ComposeResult:
        template = store.selected_template()
        picked = "auto-selected" if store.get_assessment().template_auto else "selected"
        yield from _request_message()
        yield _ai_label(f"{template.name} template {picked} · drafted a scope manifest for "
                        "your approval")
        yield from self._manifest_panel(approved=False)
        yield Question(
            "Scope", "Approve this scope manifest?",
            [
                Choice("approve", "Approve scope",
                       "Lock the manifest; next you review the test plan.", recommended=True),
                *self._spec_choices(),
                Choice("edit", "Edit manifest",
                       "Change methods, excluded paths, ports, tools or the time limit."),
                Choice("reject", "Reject",
                       "Discard this draft: nothing is tested and the assessment stops.",
                       "danger"),
            ],
            hint=menu_hint("go back"), menu_id="scope-menu",
        )

    @staticmethod
    def _spec_choices() -> List[Choice]:
        """The API template can take an OpenAPI file or URL; it is read, never run."""
        if not store.can_attach_api_spec():
            return []
        attached = store.get_api_spec() is not None
        choices = [Choice("spec", "Replace OpenAPI spec" if attached else "Attach OpenAPI spec",
                          "a .json or .yaml OpenAPI 3 / Swagger 2 file or URL; read, never run")]
        if attached:
            choices.append(Choice("unspec", "Remove OpenAPI spec",
                                  "go back to the template's endpoints and methods"))
        return choices

    def _compose_approved(self) -> ComposeResult:
        yield from _request_message()
        yield _ai_label(f"scope approved · assessment {store.assessment_label()} created")
        yield from self._manifest_panel(approved=True)
        yield Question("Scope", "The scope is locked. Review the test plan?",
                       [Choice("plan", "Review the test plan",
                               "Every phase, the login it may need, and the risky steps.",
                               recommended=True)],
                       hint=menu_hint("go back"), typing=False, menu_id="scope-menu")

    def _compose_stopped(self) -> ComposeResult:
        yield from _request_message()
        yield _ai_label(f"this assessment stopped before testing: {store.get_run().stopped}")
        yield Question("Template", "Start again?",
                       [Choice("new", "Start a new assessment",
                               "Pick a template and type a target.", recommended=True),
                        Choice("start", "Back to the start")],
                       hint=menu_hint("go back"), typing=False, chat=False,
                       menu_id="template-menu")

    # --- focus and live updates -----------------------------------------------------------------
    def on_mount(self) -> None:
        preset = self.app.template_pick
        self.app.template_pick = None
        if self.state() == "pick" and preset:
            self._pick(preset)
            return
        for menu_id in ("template-menu", "scope-menu"):
            self.focus_menu(menu_id)

    def refresh_live(self) -> None:
        manifests = self.query("#manifest")
        if manifests:
            manifests.first(ScopeManifestView).show(store.get_scope())   # after an edit
        activity = self.query("#template-activity")
        if activity:
            activity.first(ActivityStatus).show(_steps())

    # --- choices -----------------------------------------------------------------------------
    def on_choice_menu_chosen(self, event: ChoiceMenu.Chosen) -> None:
        event.stop()
        choice = event.choice_id
        if choice == "chat":
            self.chat_about()
            return
        state = self.state()
        if state == "pick":
            self._pick(choice)
        elif state == "choose":
            self.app.choose_template(choice)
        elif state == "review":
            {"approve": self.app.approve_scope, "spec": self.app.attach_api_spec,
             "unspec": self.app.remove_api_spec,
             "edit": self.app.edit_scope, "reject": self.app.reject_scope}[choice]()
        elif state == "approved":
            self.app.goto("plan")
        elif state == "stopped" and choice == "new":
            self.app.new_assessment()
        elif state == "stopped":
            self.app.goto("start")

    def _pick(self, template_id: str) -> None:
        try:
            template = store.get_template(template_id)
        except store.StoreValidationError as exc:
            self.notify_error(str(exc))
            return
        self._picked = template.id
        self.query_one("#target-label", Label).update(
            Text(f"Target ▸ {template.name} — {template.target_hint}"))
        target = self.query_one("#target", Input)
        target.placeholder = template.example
        self.query_one("#target-error", Static).update("")
        self.query_one("#target-row").display = True
        target.focus()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        event.stop()
        if self._picked is None:
            return
        try:
            store.check_target(self._picked, event.value)
        except store.StoreValidationError as exc:
            self.query_one("#target-error", Static).update(
                Text(str(exc), style=theme.CRITICAL))
            return
        self.app.start_with_template(event.value, self._picked)

    def action_back(self) -> None:
        rows = self.query("#target-row")
        if rows and rows.first().display:
            rows.first().display = False       # Esc in the target: pick another template
            self._picked = None
            self.focus_menu("template-menu")
            return
        self.app.go_prev()

    def chat_topic(self) -> str:
        return "the scope manifest" if self.state() in ("review", "approved") else "the template"
