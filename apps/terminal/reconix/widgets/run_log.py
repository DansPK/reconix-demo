"""The live output of a run, read like a Claude conversation.

Messages (what you typed, what Reconix tells you, policy banners) stay on screen; the steps
between two messages fold into one `ThinkingBlock` (see `store.group_stream`). The log
follows the newest line while you're at the bottom; scroll up to read and it stays put,
counting what arrived, until you're back at the end.
"""

from typing import Dict, List, Optional

from rich.text import Text
from textual.containers import VerticalScroll
from textual.widget import Widget
from textual.widgets import Static

from .. import store, theme
from ..models import MessageItem, StreamItem, ThinkingItem
from .log_rows import message_line
from .thinking_block import ThinkingBlock


def item_key(item: StreamItem) -> str:
    """Stable per item: a message by its seq, a block by its first step's seq."""
    return f"m{item.entry.seq}" if isinstance(item, MessageItem) else f"t{item.key}"


class MessageLine(Static):
    """One message: a glyph in the speaker's colour and the text (never markup)."""

    def __init__(self, item: MessageItem) -> None:
        super().__init__(message_line(item.entry), classes="message-line")
        self.item = item
        self._shown = (item.entry.text, item.entry.tone)

    def show(self, item: MessageItem) -> None:
        """Redraw if the message changed (a streamed reply grows in place)."""
        if (item.entry.text, item.entry.tone) != self._shown:
            self._shown = (item.entry.text, item.entry.tone)
            self.update(message_line(item.entry))


class RunLog(VerticalScroll):
    """Messages and thinking blocks. `sync(live)` adds what the stream has that it doesn't.

    `live` is where the run stands ("running" | "paused" | "stopped" | "done"); it decides
    how the last block reads. `set_expanded()` opens or folds every block (the app's
    Ctrl+O); new blocks follow it. `set_status()` sets the text in the bottom border, which
    also says how many entries arrived while you scrolled up.
    """

    def __init__(self, *, expanded: bool = False, **kwargs) -> None:
        super().__init__(**kwargs)
        self._items: Dict[str, Widget] = {}
        self._live = "done"
        self._expanded = expanded
        self._last_seq = 0
        self._following = True  # at the bottom: new lines scroll into view
        self._unseen = 0  # entries that arrived while you were scrolled up
        self._status = ""

    @property
    def following(self) -> bool:
        return self._following

    @property
    def unseen(self) -> int:
        return self._unseen

    def on_mount(self) -> None:
        self.sync()

    def sync(self, live: Optional[str] = None) -> None:
        self._live = live or self._live
        entries = store.stream()
        items = store.group_stream(entries, self._live)
        keys = {item_key(item) for item in items}
        for key in [k for k in self._items if k not in keys]:  # another assessment
            self._items.pop(key).remove()
        new: List[Widget] = []
        for item in items:
            key = item_key(item)
            widget = self._items.get(key)
            if widget is None:
                widget = self._make(item)
                self._items[key] = widget
                new.append(widget)
            elif isinstance(widget, ThinkingBlock) and isinstance(item, ThinkingItem):
                widget.show(item)
            elif isinstance(widget, MessageLine) and isinstance(item, MessageItem):
                widget.show(item)
        if new:
            self.mount_all(new)
        self._count_new([entry.seq for entry in entries])
        if self._following:
            self.call_after_refresh(self.scroll_end, animate=False)

    def set_expanded(self, expanded: bool) -> None:
        self._expanded = expanded
        for block in self.query(ThinkingBlock):
            block.set_expanded(expanded)

    def set_status(self, status: str) -> None:
        self._status = status
        self._show_status()

    def follow(self) -> None:
        """Jump to the newest line and follow again."""
        self.scroll_end(animate=False)

    def plain_lines(self, include_folded: bool = True) -> List[str]:
        """What the log holds, as plain text (folded steps too unless told otherwise)."""
        lines: List[str] = []
        for widget in self._items.values():
            if isinstance(widget, ThinkingBlock):
                lines += widget.plain_lines(include_folded)
            else:
                lines.append(message_line(widget.item.entry).plain)
        return lines

    def _make(self, item: StreamItem) -> Widget:
        if isinstance(item, MessageItem):
            return MessageLine(item)
        return ThinkingBlock(item, expanded=self._expanded)

    def _count_new(self, seqs: List[int]) -> None:
        arrived = [seq for seq in seqs if seq > self._last_seq]
        if not arrived:
            return
        self._last_seq = arrived[-1]
        if not self._following:
            self._unseen += len(arrived)
            self._show_status()

    def watch_scroll_y(self, old_value: float, new_value: float) -> None:
        super().watch_scroll_y(old_value, new_value)
        if self.is_vertical_scroll_end:  # checked first: a resize can clamp upward
            following = True
        elif new_value < old_value:  # only you scroll up; new lines scroll down
            following = False
        else:
            return
        if following != self._following or (following and self._unseen):
            self._following = following
            if following:
                self._unseen = 0
            self._show_status()

    def _show_status(self) -> None:
        """The bottom border. Built as Text: the status holds scope tools, never markup."""
        text = Text()
        if not self._following:
            new = f"↓ {self._unseen} new · " if self._unseen else ""
            text.append(f"{new}End to follow", style=f"bold {theme.CYAN}")
            if self._status:
                text.append(" · ")
        text.append(self._status)
        self.border_subtitle = text
