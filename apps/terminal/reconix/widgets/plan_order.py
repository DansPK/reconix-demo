"""The plan's order list: the operator moves the gated checks, Enter saves, Esc cancels.

Used by the step chat after a reorder request ("move 3b before 3a"). Every plan row is
listed in order; the phases are fixed (each works on what the one before found) and only
the gated checks move, with Shift+↑/↓, among themselves. This widget only reports the
operator's order; the store (`reorder_gated`) checks it and moves the run's steps.
"""

from typing import List, Optional, Sequence

from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.message import Message
from textual.widgets import OptionList, Static
from textual.widgets.option_list import Option

from .. import theme
from ..models import PlanRow

HINT = "Shift+↑/↓ move a gated check · Enter save · Esc cancel"
FIXED_NOTE = "That step is fixed: the phases run in order. Only the gated checks move."


class _Rows(OptionList):
    BINDINGS = [
        Binding("shift+up", "move(-1)", "move up", show=False),
        Binding("shift+down", "move(1)", "move down", show=False),
        Binding("enter", "save", "save", show=False),
        Binding("escape", "cancel", "cancel", show=False),
    ]

    def action_move(self, delta: int) -> None:
        self.parent.move(delta)

    def action_save(self) -> None:
        self.parent.save()

    def action_cancel(self) -> None:
        self.parent.post_message(PlanOrder.Cancelled(self.parent))


class PlanOrder(Vertical):
    """Plan rows to put in order. Posts `Saved(order)` (request ids) or `Cancelled`."""

    class Saved(Message):
        def __init__(self, plan_order: "PlanOrder", order: List[str]) -> None:
            super().__init__()
            self.plan_order = plan_order
            self.order = order

    class Cancelled(Message):
        def __init__(self, plan_order: "PlanOrder") -> None:
            super().__init__()
            self.plan_order = plan_order

    def __init__(
        self, rows: Sequence[PlanRow], movable: Sequence[str], *, id: Optional[str] = None
    ) -> None:
        # A class, not a fixed id: a second reorder in the same chat mounts a new list while
        # the old one may still be leaving the DOM.
        super().__init__(id=id, classes="tick-list")
        self._rows = list(rows)
        # The gated rows in plan order, paired with their request ids.
        gated = [row for row in self._rows if row.gate == "approve"]
        self._ids = {row.num: request_id for row, request_id in zip(gated, movable)}

    def compose(self) -> ComposeResult:
        yield Static(Text("Plan order", style=f"bold {theme.TEXT}"))
        yield _Rows(*[Option(self._line(row)) for row in self._rows], id="plan-order-rows")
        yield Static("", id="plan-order-note", classes="menu-hint")
        yield Static(Text(HINT, style=theme.DIM), classes="menu-hint")

    def on_mount(self) -> None:
        rows = self.query_one(_Rows)
        first = self._first_movable()
        rows.highlighted = first if first is not None else 0
        rows.focus()

    def _movable(self, index: int) -> bool:
        return 0 <= index < len(self._rows) and self._rows[index].num in self._ids

    def _first_movable(self) -> Optional[int]:
        return next((i for i in range(len(self._rows)) if self._movable(i)), None)

    def _line(self, row: PlanRow) -> Text:
        movable = row.num in self._ids
        line = Text("⇅ " if movable else "· ", style=theme.CYAN if movable else theme.DIM)
        line.append(f"{row.num:<4}", style=f"bold {theme.MUTED}")
        line.append(row.label, style=f"bold {theme.TEXT}" if movable else theme.MUTED)
        if movable:
            line.append(f"   {row.risk}", style=f"bold {theme.RISK.get(row.risk, theme.MUTED)}")
        return line

    def move(self, delta: int) -> None:
        """Swap the highlighted gated check with its neighbour, if that one moves too."""
        rows = self.query_one(_Rows)
        index = rows.highlighted
        note = self.query_one("#plan-order-note", Static)
        if index is None or not self._movable(index) or not self._movable(index + delta):
            note.update(Text(FIXED_NOTE, style=theme.MEDIUM))
            return
        note.update("")
        other = index + delta
        self._rows[index], self._rows[other] = self._rows[other], self._rows[index]
        for i in (index, other):
            rows.replace_option_prompt_at_index(i, self._line(self._rows[i]))
        rows.highlighted = other

    def order(self) -> List[str]:
        """The gated checks' request ids in the order shown."""
        return [self._ids[row.num] for row in self._rows if row.num in self._ids]

    def save(self) -> None:
        self.post_message(PlanOrder.Saved(self, self.order()))
