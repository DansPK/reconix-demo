"""A Claude-style "working" line: a spinning glyph and what Reconix is doing."""

from typing import Optional

from rich.text import Text
from textual.widgets import Static

from .. import theme

FRAMES = ("✻", "✶", "✽", "✢", "·", "✢", "✽", "✶")


def spinner_line(frame: int, message: str, hint: str = "") -> Text:
    glyph = FRAMES[frame % len(FRAMES)]
    line = Text.assemble((f"{glyph} ", f"bold {theme.CYAN}"), (message, theme.TEXT))
    if hint:
        line.append(f"   {hint}", style=theme.DIM)
    return line


class Spinner(Static):
    """Spins while mounted; `set_message()` changes the text (plain text, never markup).

    A dim `hint` after the message (e.g. the elapsed time) is optional.
    """

    def __init__(self, message: str, *, hint: str = "", id: Optional[str] = None,
                 classes: Optional[str] = None) -> None:
        super().__init__(id=id, classes=classes)
        self._message = message
        self._hint = hint
        self._frame = 0

    def on_mount(self) -> None:
        self._draw()
        self.set_interval(0.12, self._tick)

    def set_message(self, message: str, hint: str = "") -> None:
        self._message = message
        self._hint = hint
        self._draw()

    def _tick(self) -> None:
        self._frame += 1
        self._draw()

    def _draw(self) -> None:
        self.update(spinner_line(self._frame, self._message, self._hint))
