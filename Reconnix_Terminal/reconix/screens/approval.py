"""Frame 04 — Human approval gate (MEDIUM: one decision; HIGH: a double check).

The run stops here when it reaches a gated action. The store is the authority: it re-checks
the command hash and, for HIGH risk, the single-use confirmation token; the screen only asks.
When nothing is waiting, the screen lists the decisions made and the actions still ahead.
"""

from copy import deepcopy
from typing import List, Optional

from rich.console import RenderableType
from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.widgets import Static

from .base import ReconixScreen
from .choice import ChoiceScreen, details_body
from .. import store, theme
from ..models import GATE_APPROVAL_PREFIX, ApprovalRequest, Choice
from ..widgets import ChoiceMenu, Question, menu_hint


def waiting_request() -> Optional[ApprovalRequest]:
    """The approval request the run is waiting on right now, if any."""
    gate = store.waiting_gate()
    if not gate.startswith(GATE_APPROVAL_PREFIX) or store.gate_state(gate) != "pending":
        return None
    return store.get_approval(gate[len(GATE_APPROVAL_PREFIX):])


def _row(label: str, *parts) -> Static:
    return Static(Text.assemble((f"{label:<12}", theme.DIM), *parts), classes="approval-row")


class ApprovalScreen(ReconixScreen):
    flow_name = "approval"
    mode_name = "APPROVAL"

    BINDINGS = [
        Binding("enter", "choose", "select", show=False),
        Binding("d", "details", "details"),
        Binding("escape", "later", "decide later"),
    ]

    def __init__(self) -> None:
        super().__init__()
        request = waiting_request()
        # A copy: what the operator approves is what was shown (the store re-checks the hash).
        self._request: Optional[ApprovalRequest] = deepcopy(request) if request else None

    def view_state(self) -> object:
        request = waiting_request()       # an edit changes the hash: rebuild with the new one
        return (request.request_id, request.command_hash) if request else ""

    @property
    def _high(self) -> bool:
        return self._request is not None and self._request.risk == "HIGH"

    # --- layout ------------------------------------------------------------------------------
    def compose_body(self) -> ComposeResult:
        if self._request is None:
            yield from self._compose_idle()
        else:
            yield from self._compose_waiting(self._request)

    def _compose_waiting(self, req: ApprovalRequest) -> ComposeResult:
        approvals = [a.request_id for a in store.get_assessment().approvals]
        position = approvals.index(req.request_id) + 1 if req.request_id in approvals else 1
        context = next((e.message for e in reversed(store.list_activity())
                        if e.source == "AI"), "testing in progress")
        yield Static(Text.assemble(("✓ ", theme.GREEN), (context, theme.DIM)))
        yield Static(Text.assemble(("◆ reconix ", theme.CYAN), (
            f"gated action {position} of {len(approvals)} requires your approval",
            theme.DIM)), classes="ai-label")
        risk_color = theme.RISK.get(req.risk, theme.MUTED)
        with Vertical(classes="panel danger" if self._high else "panel accent") as panel:
            panel.border_title = "◆ HUMAN APPROVAL REQUIRED"
            panel.border_subtitle = f"[{risk_color}]◆ {req.risk} RISK[/]"
            yield _row("Action", (req.action, f"bold {theme.TEXT}"))
            yield _row("Target", (req.target, f"bold {theme.TEAL}"),
                       ("   ✓ policy check passed", theme.GREEN))
            yield _row("Purpose", (req.purpose, theme.MUTED))
            yield _row("Impact", (req.impact, theme.MUTED))
            yield Static("")
            yield Static(Text("EXACT REQUEST", style=theme.DIM))
            yield Static(Text.assemble(("$ ", f"bold {theme.GREEN}"), (req.command, theme.TEXT),
                                       ("   ", ""), (req.command_hash[:23] + "…", theme.DIM)),
                         classes="panel-note")
        yield Question(
            "Approval", f"Run {req.action} on {store.get_assessment().target}?",
            [
                Choice("approve", "Approve & run",
                       "HIGH risk: you double-check the exact request first." if self._high
                       else "Runs this one request now."),
                Choice("reject", "Reject",
                       "Not executed. The assessment stops; nothing else runs.", "danger"),
                Choice("details", "View details", "Scope limits, exact request and audit trail."),
                self._edit_choice(req),
            ],
            default=2, hint=menu_hint("decide later"), menu_id="approval-menu",
        )
        yield Static(Text(f"logged to audit · operator: {store.current_operator()}",
                          style=theme.DIM))

    @staticmethod
    def _edit_choice(req: ApprovalRequest) -> Choice:
        if not req.param_label:
            return Choice("edit", "Edit params", disabled=True)
        return Choice("edit", "Edit params",
                      f"Change the {req.param_label.lower()} first; the policy checks it again.")

    def _compose_idle(self) -> ComposeResult:
        yield Static(Text.assemble(("◆ reconix ", theme.CYAN), (
            "no action is waiting for your approval", theme.DIM)), classes="ai-label")
        with Vertical(classes="panel") as panel:
            panel.border_title = "◆ GATED ACTIONS"
            panel.border_subtitle = "the run pauses at each one"
            approvals = store.get_assessment().approvals
            if not approvals:
                yield Static(Text("None yet — they come from the template's plan.",
                                  style=theme.MUTED))
            for request in approvals:
                yield Static(self._decision_line(request))
        if store.is_plan_started():
            choices = [Choice("execution", "Back to execution", recommended=True)]
        else:
            choices = [Choice("plan", "Review the plan", recommended=True)]
        yield Question("Approval", "Nothing to decide right now.", choices,
                       hint=menu_hint("go back"), typing=False, chat=False,
                       menu_id="approval-menu")

    @staticmethod
    def _decision_line(request: ApprovalRequest) -> Text:
        decision = store.decision_for(request.request_id)
        line = Text.assemble(
            (f"● {request.risk:<7}", f"bold {theme.RISK.get(request.risk, theme.MUTED)}"),
            (f"{request.action:<32}", theme.TEXT))
        if decision is None:
            line.append("· pending", style=theme.DIM)
        else:
            approved = decision.decision == "APPROVED"
            line.append("✓ approved" if approved else "✕ rejected",
                        style=theme.GREEN if approved else theme.CRITICAL)
            line.append(f" by {decision.operator} at {decision.created_at:%H:%M:%S}",
                        style=theme.DIM)
            if decision.reason:
                line.append(f" · “{decision.reason}”", style=theme.MUTED)
        return line

    def on_mount(self) -> None:
        self.focus_menu("approval-menu")

    # --- choices -----------------------------------------------------------------------------
    def on_choice_menu_chosen(self, event: ChoiceMenu.Chosen) -> None:
        event.stop()
        handlers = {"approve": self.action_approve, "reject": self.action_reject,
                    "details": self.action_details, "edit": self.action_edit,
                    "chat": self.chat_about,
                    "execution": lambda: self.app.goto("execution"),
                    "plan": lambda: self.app.goto("plan")}
        handlers[event.choice_id]()

    def chat_topic(self) -> str:
        if self._request is None:
            return "the approvals"
        return f"{self._request.action} on {store.get_assessment().target}"

    # --- approve: one step, or a double check for HIGH risk ----------------------------------
    def action_approve(self) -> None:
        req = self._request
        if req is None:
            return
        if not self._high:
            self._approve(None)
            return
        try:
            token = store.request_confirmation(req.request_id, req.command_hash)
        except store.StoreValidationError as exc:
            self.notify_error(str(exc))
            return
        dialog = ChoiceScreen(
            "◆ HIGH-RISK · second confirmation", "Run this HIGH-risk step now?",
            [
                Choice("no", "No, go back", "Nothing runs."),
                Choice("yes", f"Yes, run {req.action} on {store.get_assessment().target}",
                       "Runs this one request now.", "danger"),
            ],
            body=self._confirmation_body(), default=0, danger=True, chip="HIGH RISK",
        )
        self.app.push_screen(dialog, lambda answer: self._confirmed(answer, token))

    def _confirmed(self, answer: Optional[str], token: str) -> None:
        if answer == "yes":
            self._approve(token)
        else:
            store.decline_confirmation(self._request.request_id)

    def _approve(self, token: Optional[str]) -> None:
        req = self._request
        try:
            store.approve(req.request_id, command_hash=req.command_hash,
                          confirmation_token=token)
        except store.StoreValidationError as exc:
            self.notify_error(str(exc))
            return
        self.app.gate_decided("execution")

    def _confirmation_body(self) -> List[Text]:
        req = self._request
        return [
            Text.assemble(("$ ", f"bold {theme.GREEN}"), (req.command, theme.TEXT)),
            Text(req.command_hash, style=theme.DIM),
            Text(""),
            Text.assemble(("Purpose  ", theme.DIM), (req.purpose, theme.TEXT)),
            Text.assemble(("Impact   ", theme.DIM), (req.impact, theme.MUTED)),
        ]

    def action_edit(self) -> None:
        if self._request is not None:
            self.app.edit_approval(self._request.request_id)

    def action_reject(self) -> None:
        if self._request is None:
            return
        try:
            store.reject(self._request.request_id)
        except store.StoreValidationError as exc:
            self.notify_error(str(exc))
            return
        self.app.gate_decided("execution")

    def action_later(self) -> None:
        if self._request is not None:
            self.notify("Nothing runs until you decide. Come back with 4 or /approval.",
                        title="Paused")
            self.app.goto("execution")
        else:
            self.app.go_prev()

    # --- details -----------------------------------------------------------------------------
    def action_details(self) -> None:
        if self._request is None:
            return
        store.log_event("approval.details_viewed", self._request.request_id)
        self.app.push_screen(ChoiceScreen(
            "▤ APPROVAL DETAILS", "", [Choice("back", "Back to the choices")],
            body=self._details_body(), chip="Details",
        ))

    def _details_body(self) -> List[RenderableType]:
        req = self._request
        scope = store.describe_scope(store.get_scope())
        events = [e for e in store.list_events() if req.request_id in e.detail]
        blocked = [v for v in store.list_verdicts() if not v.allowed]
        return details_body([
            ("Request", [
                ("id", req.request_id, theme.KEY),
                ("risk", req.risk, theme.RISK.get(req.risk, theme.MUTED)),
                ("action", req.action, theme.TEXT),
                ("purpose", req.purpose, theme.MUTED),
                ("impact", req.impact, theme.MUTED),
            ]),
            ("Exact request", [
                ("command", req.command, theme.TEXT),
                ("hash", req.command_hash, theme.MUTED),
            ]),
            ("Scope limits", [("", scope.headline, theme.TEXT)]
             + [("may do", item, theme.MUTED) for item in scope.may_do]
             + [("never touches", item, theme.CRITICAL) for item in scope.never]
             + [("tools", ", ".join(scope.tools), theme.MUTED)]),
            ("Blocked by policy", [
                (v.method, f"{v.path} · {v.reason}", theme.CRITICAL) for v in blocked
            ] or [("", "nothing blocked so far", theme.DIM)]),
            ("Audit trail", [
                (e.created_at.strftime("%H:%M:%S"), f"{e.kind} · {e.operator}", theme.MUTED)
                for e in events[-6:]
            ] or [("", "no events for this request yet", theme.DIM)]),
        ])
