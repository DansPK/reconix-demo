"""Frame 03 — Test plan: every phase, the login it may need, and the gated actions.

    none     no template yet: nothing to plan
    draft    the plan exists but the scope isn't approved yet
    busy     the scope is approved; Reconix is preparing the plan
    ready    the plan gate: run it (testing starts) or go back
    running  the plan runs; each row shows its live status
    finished the plan has run to the end; its results stay listed
    stopped  the assessment stopped (before or while the plan ran); what ran is kept

Every state is read from the store (`state()`); the screen keeps none of its own.
"""

from typing import List, Optional

from rich.text import Text
from textual import on
from textual.app import ComposeResult
from textual.binding import Binding
from textual.widget import Widget
from textual.widgets import OptionList, Static
from textual.widgets.option_list import Option

from .base import Decision, ReconixScreen, plan_card
from .. import store, theme
from ..models import GATE_PLAN, Choice, PlanRow
from ..widgets import Question, Spinner, UserMessage, menu_hint
from ..widgets.plan_rows import MISSING, plan_line

EDIT_UNAVAILABLE = "Edit steps is unavailable: no gated step can be changed right now."


def status_counts(rows: List[PlanRow]) -> str:
    """'4 done · 1 rejected · 2 not run' for the finished and stopped panels."""
    done = sum(row.status == "done" for row in rows)
    rejected = sum(row.status == "rejected" for row in rows)
    not_run = len(rows) - done - rejected
    parts = [f"{done} done"]
    if rejected:
        parts.append(f"{rejected} rejected")
    if not_run:
        parts.append(f"{not_run} not run")
    return " · ".join(parts)


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
        if run.stopped:
            return "stopped"
        if run.completed:
            return "finished"
        if run.plan_started:
            return "running"
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
            yield UserMessage(requests[0].text)          # what started it, not a chat line
        template = store.selected_template()
        counts = f"{len(rows)} steps planned · {store.gated_count()} need your approval"
        yield Static(Text.assemble(
            ("◆ reconix ", theme.CYAN),
            (f"template: {template.name if template else MISSING} · {counts}", theme.DIM)),
            classes="ai-label")
        scope = store.get_scope()
        limit = scope.time_limit_minutes
        chips = (("target", assessment.target), ("kind", assessment.target_kind),
                 ("tools", ", ".join(scope.tools)),
                 ("time limit", f"{limit} min" if limit else ""))
        line = Text()
        for key, value in chips:
            if not value:
                continue                    # a missing value is left out, never "None"
            if line:
                line.append("   ")
            line.append(f"{key} ", style=theme.DIM)
            line.append(value, style=f"bold {theme.TEAL}")
        yield Static(line, classes="muted")
        yield Static("")
        yield Static(Text.assemble(
            ("●●  Press ", theme.DIM), ("Tab", f"bold {theme.TEXT}"),
            (" to browse steps with ↑/↓", theme.DIM)), classes="muted")
        plan_list = OptionList(id="plan-list")
        width = self.app.size.width - 8         # until the list is laid out (see on_mount)
        for row in rows:
            plan_list.add_option(Option(plan_line(row, width), id=f"step-{row.num}"))
        yield plan_list

    def _question_draft(self) -> ComposeResult:
        yield Question("Plan", "Approve the scope first — the plan runs only inside it.",
                       [Choice("template", "Review the scope", "Back to the Template screen.",
                               recommended=True)],
                       hint=menu_hint("go back"), typing=False, menu_id="plan-menu")

    def _question_busy(self) -> ComposeResult:
        yield Spinner("reconix is preparing the test plan…", classes="spinner")

    def _question_ready(self) -> ComposeResult:
        decision = self._ready_decision()
        yield Question(
            decision.chip, decision.question, decision.choices,
            hint=menu_hint("go back", "Tab to browse steps"), menu_id="plan-menu",
        )
        if not self._editable():
            # The menu tags any disabled choice "(not available)"; this line gives the reason.
            yield Static(Text.assemble(("✎ ", theme.DIM), (EDIT_UNAVAILABLE, theme.MUTED)),
                         id="plan-edit-note", classes="panel-note")
        yield Static(Text.assemble(("↻ ", theme.CYAN), (
            "Risky steps pause the run and ask you first; the policy engine checks every "
            "request against the approved scope.", theme.MUTED)), classes="panel-note")

    def _ready_decision(self) -> Decision:
        steps = len(store.plan_overview())
        gated = store.gated_count()
        return Decision("Plan", "Run this plan?", [
            Choice("run", "Run plan",
                   f"{steps} steps · {gated} need{'s' if gated == 1 else ''} your approval "
                   "while it runs.", recommended=True),
            self._edit_choice(),
            Choice("cancel", "Cancel", "Back to the scope. Nothing runs.", "danger"),
        ])

    @staticmethod
    def _editable() -> bool:
        """At least one gated step may be edited now (the store decides: `can_edit`)."""
        return any(store.can_edit(a.request_id) for a in store.get_assessment().approvals)

    def _edit_choice(self) -> Choice:
        if not self._editable():
            return Choice("edit", "Edit steps", disabled=True)
        return Choice("edit", "Edit steps",
                      "Change where a gated step runs; the policy checks it again.")

    def _question_running(self) -> ComposeResult:
        yield Question("Plan", "The plan is running.",
                       [Choice("execution", "View execution", "The live run and its output.",
                               recommended=True)],
                       hint=menu_hint("go back", "Tab to browse steps"),
                       typing=False, menu_id="plan-menu")

    def _question_finished(self) -> ComposeResult:
        yield Question("Plan", "The plan has run.",
                       [Choice("findings", "View findings", recommended=True),
                        Choice("execution", "View execution", "What ran, step by step.")],
                       hint=menu_hint("go back", "Tab to browse steps"),
                       typing=False, menu_id="plan-menu")
        yield self._results_note("Finished")

    def _question_stopped(self) -> ComposeResult:
        run = store.get_run()
        if not run.plan_started:
            yield Question("Plan", f"This assessment stopped: {run.stopped}.",
                           [Choice("new", "Start a new assessment", recommended=True)],
                           hint=menu_hint("go back"), typing=False, chat=False,
                           menu_id="plan-menu")
            return
        # Stopped while the plan ran: what ran, and any findings, stay available.
        yield Question("Plan", f"This assessment stopped: {run.stopped}. What ran is kept.",
                       [Choice("findings", "View findings"),
                        Choice("execution", "View execution", "What ran before the stop."),
                        Choice("new", "Start a new assessment", recommended=True)],
                       default=2, hint=menu_hint("go back", "Tab to browse steps"),
                       typing=False, chat=False, menu_id="plan-menu")
        yield self._results_note("Stopped")

    @staticmethod
    def _results_note(title: str) -> Static:
        return Static(Text.assemble((f"■ {title}: ", theme.CYAN),
                                    (status_counts(store.plan_overview()), theme.MUTED)),
                      id="plan-results", classes="panel-note")

    # --- focus and live updates -----------------------------------------------------------------
    def on_mount(self) -> None:
        lists = self.query("#plan-list")
        if lists:
            # Without a highlight, Enter on the step list is swallowed and does nothing.
            lists.first(OptionList).highlighted = 0
        self.focus_menu("plan-menu", top=True)
        self.call_after_refresh(self.refresh_live)   # redraw rows at the laid-out width

    def _plan_list(self) -> Optional[OptionList]:
        lists = self.query("#plan-list")
        return lists.first(OptionList) if lists else None

    def refresh_live(self) -> None:
        """Redraw the rows from the store, keeping focus, the highlighted row and the scroll."""
        plan_list = self._plan_list()
        if plan_list is None:
            return
        rows = store.plan_overview()
        width = plan_list.scrollable_content_region.width or self.app.size.width - 8
        if len(rows) != plan_list.option_count:      # rows came or went: rebuild in place
            highlighted, scroll_y = plan_list.highlighted, plan_list.scroll_y
            plan_list.clear_options()
            plan_list.add_options([Option(plan_line(row, width), id=f"step-{row.num}")
                                   for row in rows])
            if rows:
                plan_list.highlighted = min(highlighted or 0, len(rows) - 1)
            plan_list.scroll_to(y=scroll_y, animate=False)
        for index, row in enumerate(rows):
            full = index == plan_list.highlighted
            plan_list.replace_option_prompt_at_index(index, plan_line(row, width, full))

    @on(OptionList.OptionHighlighted, "#plan-list")
    def _step_highlighted(self, event: OptionList.OptionHighlighted) -> None:
        self.refresh_live()                          # the highlighted row shows in full

    def on_resize(self) -> None:
        self.call_after_refresh(self.refresh_live)

    def action_toggle_focus(self) -> None:
        plan_list = self._plan_list()
        if plan_list is None:
            return
        menus = self.query("#plan-menu")
        if not menus:
            plan_list.focus()                        # busy: only the steps to browse
            return
        menu = menus.first()
        (plan_list if menu.has_focus else menu).focus()

    # --- choices -----------------------------------------------------------------------------
    def decision(self) -> Optional[Decision]:
        if self.state() == "ready":
            return self._ready_decision()
        return None

    def decide(self, choice: str) -> None:
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
            self.chat_in_step()

    @on(OptionList.OptionSelected, "#plan-list")
    def _step_selected(self, event: OptionList.OptionSelected) -> None:
        self.focus_menu("plan-menu")     # Enter on a step returns to the decision

    def action_cancel(self) -> None:
        plan_list = self._plan_list()
        if plan_list is not None and plan_list.has_focus and self.query("#plan-menu"):
            self.focus_menu("plan-menu")   # Esc steps back to the menu first
            return
        self.app.go_prev()

    def chat_topic(self) -> str:
        return "the test plan"

    def step_content(self) -> str:
        if self.state() == "ready":
            return "The test plan, step by step. Nothing has run yet."    # + the card
        return "The test plan and where each step stands."

    def chat_card(self) -> Optional[Widget]:
        return plan_card() if self.state() != "none" else None

    def allows_reorder(self) -> bool:
        return self.state() == "ready"
