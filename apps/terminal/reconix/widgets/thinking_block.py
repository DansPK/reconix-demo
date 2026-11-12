"""A thinking block: the steps between two messages, folded to one title line (Claude-style).

Folded, it is one line: a spinner and the time so far while it runs ("✽ Working… 14s"),
then "✓ Worked for 9s · 7 steps · 1 blocked". While it is still going, the newest step
shows dimmed under the title. Opened (click, Space on the title, or the app's Ctrl+O for
every block), it lists each step as time · who · message.
"""

from datetime import timedelta
from typing import List

from rich.console import Group
from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.widgets import Static

from .. import store, theme
from ..models import ThinkingItem
from .log_rows import entry_text, step_plain, step_row
from .spinner import FRAMES, duration_text

# a block that is not going on its own: (glyph, color, title) by state
STATE_GLYPH = {
    "paused": ("⏸", theme.MEDIUM, "Waiting for you"),
    "stopped": ("✕", theme.CRITICAL, "Stopped"),
}


def _plural(count: int, word: str) -> str:
    return f"{count} {word}{'' if count == 1 else 's'}"


def block_title(item: ThinkingItem, frame: int = 0, expanded: bool = False) -> Text:
    """The block's one title line."""
    seconds = duration_text(timedelta(seconds=store.block_seconds(item)))
    if item.state == "running":
        title = Text.assemble(
            (f"{FRAMES[frame % len(FRAMES)]} ", f"bold {theme.CYAN}"),
            ("Thinking…" if item.verb == "Thought" else "Working…", theme.TEXT),
            (f" {seconds}", theme.DIM),
        )
    elif item.state == "done":
        words = f"{item.verb} for {seconds}" if item.seconds else item.verb
        title = Text.assemble(("✓ ", f"bold {theme.GREEN}"), (words, theme.MUTED))
    else:
        glyph, color, words = STATE_GLYPH[item.state]
        title = Text.assemble((f"{glyph} ", f"bold {color}"), (words, color))
    title.append(f" · {_plural(len(item.steps), 'step')}", style=theme.DIM)
    if item.blocked:
        title.append(f" · {item.blocked} blocked", style=theme.CRITICAL)
    title.append(f"  {'▾' if expanded else '▸'}", style=theme.DIM)
    return title


def latest_line(item: ThinkingItem) -> Text:
    """The newest step, dimmed, under a folded block that is still going."""
    return Text.assemble(("└ ", theme.DIM), (entry_text(item.steps[-1]).plain, theme.DIM))


class ThinkingTitle(Static, can_focus=True):
    """The block's title line: click it, or Space while it has focus, to open or close."""

    BINDINGS = [Binding("space", "toggle", "open / close the steps", show=False)]

    def on_click(self) -> None:
        self.action_toggle()

    def action_toggle(self) -> None:
        block = next((a for a in self.ancestors if isinstance(a, ThinkingBlock)), None)
        if block is not None:
            block.toggle()


class ThinkingBlock(Vertical):
    """One `ThinkingItem`. `show(item)` redraws it in place and keeps it open or folded."""

    # layout only (a Vertical is 1fr by default); the look is `.thinking*` in reconix.tcss
    DEFAULT_CSS = "ThinkingBlock { height: auto; }"

    def __init__(self, item: ThinkingItem, *, expanded: bool = False) -> None:
        super().__init__(classes="thinking")
        self._item = item
        self._expanded = expanded
        self._frame = 0

    @property
    def item(self) -> ThinkingItem:
        return self._item

    @property
    def expanded(self) -> bool:
        return self._expanded

    def compose(self) -> ComposeResult:
        yield ThinkingTitle(classes="thinking-title")
        yield Static(classes="thinking-latest")
        yield Static(classes="thinking-body")

    def on_mount(self) -> None:
        self._spin = self.set_interval(0.12, self._tick, pause=True)
        self._draw()

    def show(self, item: ThinkingItem) -> None:
        self._item = item
        if self.is_mounted:
            self._draw()

    def set_expanded(self, expanded: bool) -> None:
        self._expanded = expanded
        if self.is_mounted:
            self._draw()

    def toggle(self) -> None:
        self.set_expanded(not self._expanded)

    def plain_lines(self, include_folded: bool = True) -> List[str]:
        """The block as plain text: its title, and its steps if open (or `include_folded`)."""
        lines = [block_title(self._item, self._frame, self._expanded).plain]
        if self._expanded or include_folded:
            lines += [step_plain(step) for step in self._item.steps]
        return lines

    def _tick(self) -> None:
        self._frame += 1
        self._title().update(block_title(self._item, self._frame, self._expanded))

    def _title(self) -> Static:
        return self.query_one(ThinkingTitle)

    def _draw(self) -> None:
        if not self.query(".thinking-body"):
            return  # composed children not mounted yet; on_mount draws
        item = self._item
        if item.state == "running":
            self._spin.resume()
        else:
            self._spin.pause()
        self._title().update(block_title(item, self._frame, self._expanded))
        latest = self.query_one(".thinking-latest", Static)
        latest.display = not self._expanded and item.state != "done"
        if latest.display:
            latest.update(latest_line(item))
        body = self.query_one(".thinking-body", Static)
        body.display = self._expanded
        if self._expanded:
            body.update(Group(*(step_row(step) for step in item.steps)))

