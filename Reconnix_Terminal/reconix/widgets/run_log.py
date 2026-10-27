"""The live output of a run: assistant lines and activity-log rows in one ordered stream.

Every line has the same shape, in aligned columns: time · who · message (wrapped text
stays under its message). The log follows the newest line while you're at the bottom;
scroll up to read and it stays put, counting what arrived, until you're back at the end.
"""

from typing import List, Union

from rich.table import Table
from rich.text import Text
from textual.widgets import RichLog

from .. import store, theme
from ..models import ActivityEntry, ChatEntry

Entry = Union[ChatEntry, ActivityEntry]

# who said it, in plain words: chat speakers, then activity-log sources
SPEAKER_NAME = {"reconix": "reconix", "you": "you", "policy": "policy"}
SOURCE_NAME = {"AI": "reconix", "USER": "you", "TOOL": "tool", "POLICY": "policy",
               "SYS": "system"}
WHO_WIDTH = max(len(name) for name in (*SPEAKER_NAME.values(), *SOURCE_NAME.values()))


def stream() -> List[Entry]:
    """Chat and activity entries of the current assessment, in the order they happened."""
    entries: List[Entry] = list(store.list_chat()) + list(store.list_activity())
    return sorted(entries, key=lambda entry: entry.seq)


def _who(entry: Entry) -> Text:
    if isinstance(entry, ActivityEntry):
        name, color = SOURCE_NAME.get(entry.source, ""), theme.SOURCE.get(entry.source)
    else:
        name, color = SPEAKER_NAME.get(entry.speaker, ""), theme.SPEAKER.get(entry.speaker)
    return Text(name, style=f"bold {color or theme.MUTED}")


def _message(entry: Entry) -> Text:
    """The message column. Built as Text, so tool output and typed text are never markup."""
    tone = theme.TONE.get(entry.tone, theme.TEXT)
    if isinstance(entry, ActivityEntry):
        return Text(entry.message, style=tone)
    if entry.kind == "banner":
        return Text(entry.text, style=f"bold {tone}")
    if entry.kind == "check":
        return Text.assemble(("✓ ", theme.GREEN), (entry.text, tone))
    if entry.kind == "card":
        line = Text(entry.text, style=f"bold {theme.TEXT}")
        for label, value in entry.rows:
            line.append("   ")
            line.append(f"{label} ", style=theme.DIM)
            line.append(value, style=theme.TEAL)
        return line
    return Text(entry.text, style=tone)


def entry_row(entry: Entry) -> Table:
    """One log line: time · who · message, in fixed columns."""
    grid = Table.grid(padding=(0, 2))
    grid.add_column(no_wrap=True)
    grid.add_column(no_wrap=True, width=WHO_WIDTH)
    grid.add_column()
    grid.add_row(Text(entry.created_at.strftime("%H:%M:%S"), style=theme.DIM),
                 _who(entry), _message(entry))
    return grid


class RunLog(RichLog):
    """A RichLog that appends the stream entries it hasn't shown yet (`sync()`).

    It follows new lines only while scrolled to the bottom. `set_status()` sets the text
    in the bottom border, which also says how many lines arrived while you scrolled up.
    """

    def __init__(self, **kwargs) -> None:
        # min_width=1: lines wrap at the log's width (the default 78 overflows 80 columns)
        super().__init__(markup=False, highlight=False, wrap=True, auto_scroll=False,
                         min_width=1, **kwargs)
        self._last_seq = 0
        self._following = True     # at the bottom: new lines scroll into view
        self._unseen = 0           # lines that arrived while you were scrolled up
        self._status = ""

    @property
    def following(self) -> bool:
        return self._following

    @property
    def unseen(self) -> int:
        return self._unseen

    def on_mount(self) -> None:
        self.sync()

    def sync(self) -> None:
        new = [entry for entry in stream() if entry.seq > self._last_seq]
        for entry in new:
            # expand: lay each line out at the log's own width, not the console's
            self.write(entry_row(entry), expand=True, scroll_end=self._following)
        if not new:
            return
        self._last_seq = new[-1].seq
        if not self._following:
            self._unseen += len(new)
            self._show_status()

    def set_status(self, status: str) -> None:
        self._status = status
        self._show_status()

    def follow(self) -> None:
        """Jump to the newest line and follow again."""
        self.scroll_end(animate=False)

    def watch_scroll_y(self, old_value: float, new_value: float) -> None:
        super().watch_scroll_y(old_value, new_value)
        if self.is_vertical_scroll_end:          # checked first: a resize can clamp upward
            following = True
        elif new_value < old_value:              # only you scroll up; writes scroll down
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
