"""Frame 03 — Test plan: every phase, the login it may need, and the gated actions.

    none     no template yet: nothing to plan
    draft    the plan exists but the scope isn't approved yet
    busy     the scope is approved; Reconix is preparing the plan
    ready    the plan gate: run it (testing starts) or go back
    running  the plan runs; each row shows its live status
    stopped  the assessment stopped before the plan ran
"""

from rich.text import Text
from textual import on
from textual.app import ComposeResult
from textual.binding import Binding
from textual.widgets import OptionList, Static
from textual.widgets.option_list import Option

from .base import ReconixScreen
from .. import store, theme
from ..models import GATE_PLAN, Choice, PlanRow
from ..widgets import ChoiceMenu, Question, Spinner, UserMessage, menu_hint

GATE_NOTE = {"auto": "runs automatically", "login": "asks for the target login",
             "approve": "needs your approval"}
STATUS_NOTE = {"done": ("✓ done", theme.GREEN), "active": ("◌ now", theme.CYAN),
               "rejected": ("✕ rejected", theme.CRITICAL), "pending": ("· pending", theme.DIM)}


def plan_line(row: PlanRow) -> Text:
    """Two lines per row: number, label and what it does; then risk, gate and status."""
    line = Text()
    line.append(f" {row.num:<3}", style=f"bold {theme.MUTED}")
    line.append(f"{row.label:<30}", style=f"bold {theme.TEXT}")
    if row.command:
        line.append(f"$ {row.command}", style=theme.TEAL)
    else:
        line.append(row.detail, style=theme.MUTED)
    line.append("\n     ")
    line.append(f"● {row.risk}", style=f"bold {theme.RISK.get(row.risk, theme.MUTED)}")
    gate_color = theme.MEDIUM if row.gate != "auto" else theme.DIM
    line.append(f"   {GATE_NOTE.get(row.gate, row.gate)}", style=gate_color)
    note, color = STATUS_NOTE.get(row.status, STATUS_NOTE["pending"])
    line.append(f"   {note}", style=color)
    return line


class PlanScreen(ReconixScreen):
    flow_name = "plan"
    mode_name = "PLAN"

    BINDINGS = [
        Binding("enter", "choose", "select", show=False),
        Binding("tab", "toggle_focus", "browse steps"),
        Binding("escape", "cancel", "back"),
    ]

    # --- state -------------------------------------------------------------------------------
    @staticmethod
    def state() -> str:
        run = store.get_run()
        if not store.plan_overview():
            return "none"
        if run.plan_started:
            return "running"
        if run.stopped:
            return "stopped"
        if not store.is_scope_approved():
            return "draft"
        if store.waiting_gate() == GATE_PLAN:
            return "ready"
        return "busy"

    def view_state(self) -> object:
        return self.state()

    # --- layout ------------------------------------------------------------------------------
    def compose_body(self) -> ComposeResult:
        state = self.state()
        if state == "none":
            yield Static(Text.assemble(("◆ reconix ", theme.CYAN), (
                "no plan yet · pick a template and approve its scope first", theme.DIM)),
                classes="ai-label")
            yield Question("Plan", "Go to the template?",
                           [Choice("template", "Pick a template", "Then type its target.",
                                   recommended=True)],
                           hint=menu_hint("go back"), typing=False, chat=False,
                           menu_id="plan-menu")
            return
        yield from self._compose_plan()
        yield from getattr(self, f"_question_{state}")()

    def _compose_plan(self) -> ComposeResult:
        assessment = store.get_assessment()
        rows = store.plan_overview()
        requests = store.list_requests()
        if requests:
            yield UserMessage(requests[-1].text)
        yield Static(Text.assemble(
            ("◆ reconix ", theme.CYAN),
            (f"template: {store.selected_template().name} · {len(rows)} steps planned · "
             f"{store.gated_count()} need your approval", theme.DIM)), classes="ai-label")
        scope = store.get_scope()
        chips = (("target", assessment.target), ("kind", assessment.target_kind),
                 ("tools", ", ".join(scope.tools)),
                 ("time limit", f"{scope.time_limit_minutes} min"))
        line = Text()
        for i, (key, value) in enumerate(chips):
            if i:
                line.append("   ")
            line.append(f"{key} ", style=theme.DIM)
            line.append(value, style=f"bold {theme.TEAL}")
        yield Static(line, classes="muted")
        yield Static("")
        yield Static(Text.assemble(
            ("●●  Press ", theme.DIM), ("Tab", f"bold {theme.TEXT}"),
            (" to browse steps with ↑/↓", theme.DIM)), classes="muted")
        plan_list = OptionList(id="plan-list")
        for row in rows:
            plan_list.add_option(Option(plan_line(row), id=f"step-{row.num}"))
        yield plan_list

    def _question_draft(self) -> ComposeResult:
        yield Question("Plan", "Approve the scope first — the plan runs only inside it.",
                       [Choice("template", "Review the scope", "Back to the Template screen.",
                               recommended=True)],
                       hint=menu_hint("go back"), typing=False, menu_id="plan-menu")

    def _question_busy(self) -> ComposeResult:
        yield Spinner("reconix is preparing the test plan…", classes="spinner")

    def _question_ready(self) -> ComposeResult:
        steps = len(store.plan_overview())
        gated = store.gated_count()
        yield Question(
            "Plan", "Run this plan?",
            [
                Choice("run", "Run plan",
                       f"{steps} steps · {gated} need{'s' if gated == 1 else ''} your approval "
                       "while it runs.", recommended=True),
                self._edit_choice(),
                Choice("cancel", "Cancel", "Back to the scope. Nothing runs.", "danger"),
            ],
            hint=menu_hint("go back", "Tab to browse steps"), menu_id="plan-menu",
        )
        yield Static(Text.assemble(("↻ ", theme.CYAN), (
            "Risky steps pause the run and ask you first; the policy engine checks every "
            "request against the approved scope.", theme.MUTED)), classes="panel-note")

    @staticmethod
    def _edit_choice() -> Choice:
        editable = [a for a in store.get_assessment().approvals if store.can_edit(a.request_id)]
        if not editable:
            return Choice("edit", "Edit steps", disabled=True)
        return Choice("edit", "Edit steps",
                      "Change where a gated step runs; the policy checks it again.")

    def _question_running(self) -> ComposeResult:
        finished = store.is_finished()
        choices = [Choice("execution", "View execution", "The live run and its output.",
                          recommended=not finished)]
        if finished:
            choices.insert(0, Choice("findings", "View findings", recommended=True))
        yield Question("Plan", "The plan is running." if not finished else "The plan has run.",
                       choices, hint=menu_hint("go back", "Tab to browse steps"),
                       typing=False, menu_id="plan-menu")

    def _question_stopped(self) -> ComposeResult:
        yield Question("Plan", f"This assessment stopped: {store.get_run().stopped}.",
                       [Choice("new", "Start a new assessment", recommended=True)],
                       hint=menu_hint("go back"), typing=False, chat=False,
                       menu_id="plan-menu")

    # --- focus and live updates -----------------------------------------------------------------
    def on_mount(self) -> None:
        lists = self.query("#plan-list")
        if lists:
            # Without a highlight, Enter on the step list is swallowed and does nothing.
            lists.first(OptionList).highlighted = 0
        self.focus_menu("plan-menu")

    def refresh_live(self) -> None:
        lists = self.query("#plan-list")
        if not lists:
            return
        plan_list = lists.first(OptionList)
        for index, row in enumerate(store.plan_overview()):
            if index < plan_list.option_count:
                plan_list.replace_option_prompt_at_index(index, plan_line(row))

    def action_toggle_focus(self) -> None:
        lists = self.query("#plan-list")
        menus = self.query("#plan-menu")
        if not lists or not menus:
            return
        menu = menus.first()
        (lists.first() if menu.has_focus else menu).focus()

    # --- choices -----------------------------------------------------------------------------
    def on_choice_menu_chosen(self, event: ChoiceMenu.Chosen) -> None:
        event.stop()
        choice = event.choice_id
        if choice == "run":
            self.app.run_plan()
        elif choice == "edit":
            self.app.edit_plan_steps()
        elif choice in ("template", "cancel"):
            self.app.goto("template")
        elif choice in ("execution", "findings"):
            self.app.goto(choice)
        elif choice == "new":
            self.app.new_assessment()
        elif choice == "chat":
            self.chat_about()

    @on(OptionList.OptionSelected, "#plan-list")
    def _step_selected(self, event: OptionList.OptionSelected) -> None:
        self.focus_menu("plan-menu")     # Enter on a step returns to the decision

    def action_cancel(self) -> None:
        lists = self.query("#plan-list")
        if lists and lists.first().has_focus:
            self.focus_menu("plan-menu")   # Esc steps back to the menu first
            return
        self.app.go_prev()

    def chat_topic(self) -> str:
        return "the test plan"
