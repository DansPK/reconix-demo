"""Frame 05 — Live execution: the plan's tasks, what Reconix is doing now, the live output.

The run plays on its own (the app hosts it). This screen redraws after every step, says
when the run is paused at a gate (Enter opens it), and offers ^C to stop. Nothing here is
a percentage (a backend can't know how far a scan has got): a task is queued, running,
paused or done, and one spinner line says what Reconix is on and for how long.
"""

from datetime import timedelta
from typing import List, Optional, Tuple

from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.widgets import Static

from .base import ReconixScreen
from .. import store, theme
from ..models import GATE_ACCOUNT, GATE_APPROVAL_PREFIX, GATE_CODE, PlanTask
from ..widgets import RunLog, Spinner, duration_text
from ..wording import counted

LABEL_WIDTH = 30          # a task label's column; a longer label is cut


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


# what an active task says, by run state (anything else is waiting at a gate)
ACTIVE_DETAIL = {"running": "running…", "stopped": "stopped"}


def task_line(task: PlanTask, state: str) -> Text:
    color, glyph = theme.STATUS.get(task.status, (theme.DIM, "·"))
    detail = "done" if task.status == "done" else "queued"
    if task.status == "active":
        detail = ACTIVE_DETAIL.get(state, "paused · waiting for you")
    if task.key == "report" and task.status == "active":
        detail = "ready · export on Report (Alt+8)"    # fits 80 columns
    text_color = theme.TEXT if task.status == "active" else theme.MUTED
    label = task.label                       # cut, so the status after it still shows
    if len(label) > LABEL_WIDTH - 1:
        label = label[:LABEL_WIDTH - 2] + "…"
    return Text.assemble((f"{glyph} ", color), (f"{label:<{LABEL_WIDTH}}", f"bold {text_color}"),
                         (detail, theme.CYAN if task.status == "active" else theme.DIM))


# how the live output's last thinking block reads, by run state (a gate pauses it)
LOG_STATE = {"running": "running", "complete": "done", "stopped": "stopped"}


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

    def __init__(self) -> None:
        super().__init__()
        self._paused: Optional[Tuple[str, Optional[timedelta]]] = None   # (gate, time then)

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
        log = RunLog(id="live-log", expanded=self.app.activity_expanded)
        log.border_title = "▤ live output"
        yield log
        yield Static(id="exec-hint")

    def on_mount(self) -> None:
        self.refresh_live()
        self.call_after_refresh(self._refit)          # again once the panel has its width
        self.set_interval(1, self._draw_spinner)      # the elapsed time keeps counting

    def on_resize(self) -> None:
        self.call_after_refresh(self._refit)          # the border's counters fit the width

    def _refit(self) -> None:
        if self.is_mounted and self.query("#exec-hint"):   # not while the screen rebuilds
            self.refresh_live()

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
        panel.border_subtitle = Text(self._counters_line(tasks, state, panel.size.width))
        log = self.query_one("#live-log", RunLog)
        log.sync(LOG_STATE.get(state, "paused"))
        log.set_status(self._log_status(state))
        self.query_one("#exec-hint", Static).update(hint_line(state))

    def _counters_line(self, tasks: List[PlanTask], state: str, width: int) -> str:
        """The panel's bottom border: tasks done, requests, blocked, findings and the time.

        A narrow panel (80 columns) gets the short words, so nothing is cut with "…"."""
        counters = store.counters()
        done = sum(1 for t in tasks if t.status == "done")
        time_note = self._time_note(state)
        full = (f"{done} of {len(tasks)} complete · {counted(counters['requests'], 'request')}"
                f" · {counters['blocked']} blocked · "
                f"{counted(counters['findings'], 'finding')}{time_note}")
        if not width or len(full) + 6 <= width:
            return full
        short_time = time_note.replace("paused at ", "paused ").replace(" in total", " total")
        return (f"{done}/{len(tasks)} done · {counters['requests']:,} req · "
                f"{counters['blocked']} blocked · {counted(counters['findings'], 'finding')}"
                f"{short_time}")

    def _time_note(self, state: str) -> str:
        """The testing time while the spinner is hidden: frozen at a pause, final at the end.

        The store's clock keeps counting through a pause, so the screen keeps the time it
        first saw the run waiting at this gate.
        """
        if state in ("approval", "login"):
            gate = store.waiting_gate()
            if self._paused is None or self._paused[0] != gate:
                self._paused = (gate, store.elapsed())
            elapsed, words = self._paused[1], "paused at {}"
        else:
            self._paused = None
            if state == "running":
                return ""                        # the spinner line shows it
            elapsed, words = store.elapsed(), "{} in total"   # the run's finish time
        return f" · {words.format(duration_text(elapsed))}" if elapsed is not None else ""

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
            self.notify("Still running. Findings appear as they are found (Alt+6).")

    def action_stop(self) -> None:
        """Ctrl+C (the app's key on every flow screen; kept here for the footer and help)."""
        if run_state() in ("complete", "stopped"):
            return
        self.app.confirm_stop()

    def action_detach(self) -> None:
        self.app.goto("plan")

    def action_follow(self) -> None:
        self.query_one("#live-log", RunLog).follow()
