"""A Claude Code-style tick list: Space ticks a row, Enter saves, Esc cancels.

Used by the step chat for the scope's ports and tools. The rows and what starts ticked come
from the store (`replies.answer_scope_change`); this widget only reports what the operator ticked.
"""

from typing import List, Mapping, Optional, Sequence, Tuple

from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.message import Message
from textual.widgets import SelectionList, Static
from textual.widgets.selection_list import Selection

from .. import theme


class _Ticks(SelectionList):
    """A SelectionList where Enter saves (Space still ticks)."""

    BINDINGS = [
        Binding("enter", "save", "save", show=False),
        Binding("escape", "cancel", "cancel", show=False),
    ]

    def action_save(self) -> None:
        self.parent.post_message(TickList.Saved(self.parent, self.selected))

    def action_cancel(self) -> None:
        self.parent.post_message(TickList.Cancelled(self.parent))


class TickList(Vertical):
    """Ports and tools to tick. Posts `Saved(ports, tools)` or `Cancelled`."""

    class Saved(Message):
        def __init__(self, tick_list: "TickList", values: List[str]) -> None:
            super().__init__()
            self.tick_list = tick_list
            self.ports = [int(v[5:]) for v in values if v.startswith("port:")]
            self.tools = [v[5:] for v in values if v.startswith("tool:")]

    class Cancelled(Message):
        def __init__(self, tick_list: "TickList") -> None:
            super().__init__()
            self.tick_list = tick_list

    def __init__(
        self,
        ports: Sequence[Tuple[int, bool]],
        tools: Sequence[Tuple[str, bool]],
        suggested: Sequence[int] = (),
        suggested_tools: Sequence[str] = (),
        *,
        focus: str = "",
        tool_purposes: Optional[Mapping[str, str]] = None,
        id: Optional[str] = None,
    ) -> None:
        # A class, not a fixed id: a second scope change in the same chat mounts a new list
        # while the old one may still be leaving the DOM.
        super().__init__(id=id, classes="tick-list")
        self._ports = list(ports)
        self._tools = list(tools)
        self._suggested = set(suggested)
        self._suggested_tools = {s.casefold() for s in suggested_tools}
        # a one-line purpose per tool ("ffuf" -> "brute-force hidden paths"), shown on the
        # suggested rows so the operator reads what each tool is for before ticking it.
        self._purposes = {k.casefold(): v for k, v in (tool_purposes or {}).items()}
        self._focus = focus  # the row to open on ("port:3389"; "" = the first)

    def compose(self) -> ComposeResult:
        what = "ports and tools" if self._ports else "tools"
        yield Static(Text(f"Allowed {what}", style=f"bold {theme.TEXT}"))
        rows: List[Selection] = [
            Selection(self._port_label(port), f"port:{port}", ticked)
            for port, ticked in self._ports
        ] + [
            Selection(self._tool_label(tool), f"tool:{tool}", ticked)
            for tool, ticked in self._tools
        ]
        yield _Ticks(*rows, id="tick-rows")
        yield Static(
            Text("Space tick · Enter save · Esc cancel", style=theme.DIM), classes="menu-hint"
        )

    def _tool_label(self, tool: str) -> Text:
        label = Text(f"tool  {tool}")
        if tool.casefold() in self._suggested_tools:
            purpose = self._purposes.get(tool.casefold())
            if purpose:
                label.append(f" — {purpose}", style=theme.MUTED)
                label.append("   tick to add", style=theme.DIM)
            else:
                label.append("   suggested by the AI · tick to add", style=theme.DIM)
        return label

    def _port_label(self, port: int) -> Text:
        label = Text(f"port  {port:<6}")
        if port in self._suggested:
            label.append("suggested by the model · tick to add", style=theme.DIM)
        return label

    def focus_rows(self) -> None:
        """Focus the tick rows (so the operator can Space/Enter) from an outside screen."""
        self.query_one(_Ticks).focus()

    def on_mount(self) -> None:
        ticks = self.query_one(_Ticks)
        values = [f"port:{port}" for port, _ticked in self._ports] + [
            f"tool:{tool}" for tool, _ticked in self._tools
        ]
        if self._focus in values:  # the row the line named: Space ticks that one
            ticks.highlighted = values.index(self._focus)
        ticks.focus()
