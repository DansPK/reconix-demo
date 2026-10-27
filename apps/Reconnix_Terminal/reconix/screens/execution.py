"""Frame 05 — Live execution: the plan's tasks, what Reconix is doing now, the live output.

The run plays on its own (the app hosts it). This screen redraws after every step, says
when the run is paused at a gate (Enter opens it), and offers ^C to stop. Nothing here is
a percentage (a backend can't know how far a scan has got): a task is queued, running,
paused or done, and one spinner line says what Reconix is on and for how long.
"""

from datetime import timedelta
from typing import List, Optional

from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.widgets import Static

from .base import ReconixScreen
from .choice import ChoiceScreen
from .. import store, theme
from ..models import GATE_ACCOUNT, GATE_APPROVAL_PREFIX, GATE_CODE, Choice, PlanTask
from ..widgets import RunLog, Spinner


def run_state() -> str:
    """"running" | "approval" | "login" | "complete" | "stopped"."""
    run = store.get_run()
    if run.stopped:
        return "stopped"
    if run.completed:
        return "complete"
    gate = store.waiting_gate()
    if gate and store.gate_state(gate) == "pending":
        if gate.startswith(GATE_APPROVAL_PREFIX):
            return "approval"
        if gate in (GATE_ACCOUNT, GATE_CODE):
            return "login"
    return "running"


def duration_text(delta: Optional[timedelta]) -> str:
    """'45s', '3m 07s', '1h 02m'."""
    minutes, seconds = divmod(int(delta.total_seconds()) if delta else 0, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}h {minutes:02d}m"
    return f"{minutes}m {seconds:02d}s" if minutes else f"{seconds}s"


# what an active task says, by run state (anything else is waiting at a gate)
ACTIVE_DETAIL = {"running": "running…", "stopped": "stopped"}


def task_line(task: PlanTask, state: str) -> Text:
    color, glyph = theme.STATUS.get(task.status, (theme.DIM, "·"))
    detail = "done" if task.status == "done" else "queued"
    if task.status == "active":
        detail = ACTIVE_DETAIL.get(state, "paused · waiting for you")
    if task.key == "report" and task.status == "active":
        detail = "ready · export it from the Report screen"
    text_color = theme.TEXT if task.status == "active" else theme.MUTED
    return Text.assemble((f"{glyph} ", color), (f"{task.label:<30}", f"bold {text_color}"),
                         (detail, theme.CYAN if task.status == "active" else theme.DIM))


PANEL_TITLE = {
    "running": ("◌ RUNNING", theme.CYAN),
    "approval": ("⏸ WAITING FOR YOUR APPROVAL", theme.MEDIUM),
    "login": ("⏸ WAITING FOR THE TARGET LOGIN", theme.MEDIUM),
    "complete": ("✓ COMPLETE", theme.GREEN),
    "stopped": ("✕ STOPPED", theme.CRITICAL),
}


def hint_line(state: str) -> Text:
    key = ("Enter", f"bold {theme.TEXT}")
    if state == "approval":
        request = store.get_approval(store.waiting_gate()[len(GATE_APPROVAL_PREFIX):])
        return Text.assemble((f"⏸ paused — {request.action} ({request.risk}) needs your "
                              "approval. Press ", theme.MEDIUM), key, (" to review it.",
                                                                       theme.MEDIUM))
    if state == "login" and store.waiting_gate() == GATE_CODE:
        return Text.assemble(("⏸ paused — the target sent a one-time code. Press ",
                              theme.MEDIUM), key, (" to enter it.", theme.MEDIUM))
    if state == "login":
        return Text.assemble(("⏸ paused — testing needs the target login. Press ",
                              theme.MEDIUM), key, (" to add it securely.", theme.MEDIUM))
    if state == "complete":
        return Text.assemble(("✓ assessment complete — press ", theme.GREEN),
                             ("→", f"bold {theme.TEXT}"), (" or ", theme.GREEN), key,
                             (" to view findings", theme.GREEN))
    if state == "stopped":
        return Text.assemble((f"✕ stopped ({store.get_run().stopped}) — press ", theme.CRITICAL),
                             ("→", f"bold {theme.TEXT}"), (" or ", theme.CRITICAL), key,
                             (" to view partial findings", theme.CRITICAL))
    return Text.assemble(("streaming… findings appear as they are found · ", theme.DIM),
                         ("^C", f"bold {theme.TEXT}"), (" to stop", theme.DIM))


class ExecutionScreen(ReconixScreen):
    flow_name = "execution"
    mode_name = "EXECUTION"

    BINDINGS = [
        Binding("enter", "advance", "continue"),
        Binding("ctrl+c", "stop", "stop the run", show=False),
        Binding("escape", "detach", "back to plan", show=False),
        Binding("end", "follow", "follow the live output", show=False),
    ]

    def view_state(self) -> object:
        # The task rows are built per plan key; rebuild if the plan's task set changes
        # (the agent revises its plan live). Statuses are handled by refresh_live.
        return tuple(task.key for task in store.plan_tasks())

    def compose_body(self) -> ComposeResult:
        tasks = store.plan_tasks()
        yield Static(Text.assemble(("◆ reconix ", theme.CYAN), (
            f"executing approved plan · {len(tasks)} tasks · "
            f"{store.selected_template().name} template", theme.DIM)), classes="ai-label")
        with Vertical(classes="panel", id="exec-panel"):
            for task in tasks:
                yield Static(task_line(task, run_state()), id=f"task-{task.key}",
                             classes="task-row")
            yield Spinner("", id="exec-spinner")
        log = RunLog(id="live-log")
        log.border_title = "▤ live output"
        yield log
        yield Static(id="exec-hint")

    def on_mount(self) -> None:
        self.refresh_live()
        self.set_interval(1, self._draw_spinner)      # the elapsed time keeps counting

    def _draw_spinner(self, tasks: Optional[List[PlanTask]] = None) -> None:
        """While running: the task Reconix is on and the testing time so far."""
        spinner = self.query_one("#exec-spinner", Spinner)
        spinner.display = run_state() == "running"
        if not spinner.display:
            return
        tasks = store.plan_tasks() if tasks is None else tasks
        active = next((t for t in tasks if t.status == "active"), None)
        spinner.set_message(f"{active.label}…" if active else "Working…",
                            f"{duration_text(store.elapsed())} · ^C to stop")

    def refresh_live(self) -> None:
        state = run_state()
        tasks = store.plan_tasks()
        for task in tasks:
            # The plan's task set can change (the agent revises it); a reload rebuilds the
            # rows, but an event may redraw before it lands — skip rows not yet mounted.
            rows = self.query(f"#task-{task.key}")
            if rows:
                rows.first(Static).update(task_line(task, state))
        self._draw_spinner(tasks)
        panel = self.query_one("#exec-panel", Vertical)
        title, color = PANEL_TITLE[state]
        panel.border_title = Text(title, style=f"bold {color}")
        counters = store.counters()
        done = sum(1 for t in tasks if t.status == "done")
        panel.border_subtitle = Text(f"{done} of {len(tasks)} complete · "
                                     f"{counters['requests']} requests · "
                                     f"{counters['blocked']} blocked · "
                                     f"{counters['findings']} finding"
                                     f"{'' if counters['findings'] == 1 else 's'}")
        log = self.query_one("#live-log", RunLog)
        log.sync()
        log.set_status(self._log_status(state))
        self.query_one("#exec-hint", Static).update(hint_line(state))

    @staticmethod
    def _log_status(state: str) -> str:
        """Plain text: the tools come from the (editable) scope; RunLog never parses markup."""
        tools = ", ".join(store.get_scope().tools)
        return {"running": f"{tools} · ^C stop", "complete": f"{tools} · done",
                "stopped": f"{tools} · stopped"}.get(state, f"{tools} · paused")

    # --- keys ---------------------------------------------------------------------------------
    def action_advance(self) -> None:
        state = run_state()
        if state in ("approval", "login"):
            self.app.open_gate(store.waiting_gate())
        elif state in ("complete", "stopped"):
            self.app.goto("findings")
        else:
            self.notify("Still running. Findings appear as they are found (6).")

    def action_stop(self) -> None:
        if run_state() in ("complete", "stopped"):
            return

        def answer(choice: str) -> None:
            if choice == "stop":
                self.app.stop_run()

        self.app.push_screen(ChoiceScreen(
            "Stop the run", "Stop this assessment?",
            [
                Choice("keep", "Keep running", "Let the plan finish."),
                Choice("stop", "Stop now", "Nothing else runs; findings so far are kept.",
                       "danger"),
            ],
            chip="Execution", danger=True,
        ), answer)

    def action_detach(self) -> None:
        self.app.goto("plan")

    def action_follow(self) -> None:
        self.query_one("#live-log", RunLog).follow()
