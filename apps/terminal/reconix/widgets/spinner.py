"""A Claude-style "working" line: a spinning glyph and what Reconix is doing."""

from datetime import timedelta
from typing import Optional

from rich.text import Text
from textual.widgets import Static

from .. import theme

FRAMES = ("✻", "✶", "✽", "✢", "·", "✢", "✽", "✶")
REDUCED_MOTION_GLYPH = "·"
PAUSED_GLYPH = "⏸"


def duration_text(delta: Optional[timedelta]) -> str:
    """Format timedelta to '45s', '3m 07s', '1h 02m'."""
    minutes, seconds = divmod(int(delta.total_seconds()) if delta else 0, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}h {minutes:02d}m"
    return f"{minutes}m {seconds:02d}s" if minutes else f"{seconds}s"


def format_seconds(seconds: Optional[float]) -> str:
    """Format elapsed seconds to '12s', '3m 07s', '1h 02m'."""
    if seconds is None:
        return ""
    total = max(0, int(seconds))
    minutes, remainder = divmod(total, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}h {minutes:02d}m"
    if minutes:
        return f"{minutes}m {remainder:02d}s"
    return f"{remainder}s"


def format_tokens(tokens: Optional[int]) -> str:
    """Format measured backend token usage, e.g. '1.2k tokens'. Omit if None or 0."""
    if tokens is None or tokens <= 0:
        return ""
    if tokens >= 1000:
        return f"{tokens / 1000:.1f}k tokens"
    return f"{tokens} tokens"


def spinner_line(
    frame: int,
    message: str,
    hint: str = "",
    *,
    reduced_motion: bool = False,
    paused: bool = False,
) -> Text:
    if paused:
        glyph = PAUSED_GLYPH
        glyph_color = theme.MEDIUM
    elif reduced_motion:
        glyph = REDUCED_MOTION_GLYPH
        glyph_color = theme.CYAN
    else:
        glyph = FRAMES[frame % len(FRAMES)]
        glyph_color = theme.CYAN

    line = Text.assemble((f"{glyph} ", f"bold {glyph_color}"), (message, theme.TEXT))
    if hint:
        line.append(f"   {hint}", style=theme.DIM)
    return line


class Spinner(Static):
    """Spins while mounted; `set_message()` changes the text (plain text, never markup).

    Supports reduced motion (static glyph updated once per second) and pause state.
    """

    def __init__(
        self,
        message: str,
        *,
        hint: str = "",
        reduced_motion: bool = False,
        id: Optional[str] = None,
        classes: Optional[str] = None,
    ) -> None:
        super().__init__(id=id, classes=classes)
        self._message = message
        self._hint = hint
        self._frame = 0
        self._reduced_motion = reduced_motion
        self._paused = False
        self._timer = None

    @property
    def reduced_motion(self) -> bool:
        return self._reduced_motion

    @property
    def paused(self) -> bool:
        return self._paused

    def on_mount(self) -> None:
        self._draw()
        interval = 1.0 if self._reduced_motion else 0.12
        self._timer = self.set_interval(interval, self._tick)

    def set_message(self, message: str, hint: str = "") -> None:
        self._message = message
        self._hint = hint
        self._draw()

    def set_reduced_motion(self, reduced: bool) -> None:
        if self._reduced_motion != reduced:
            self._reduced_motion = reduced
            if self._timer is not None:
                self._timer.stop()
                interval = 1.0 if reduced else 0.12
                self._timer = self.set_interval(interval, self._tick)
            if self.is_mounted:
                self._draw()

    def set_paused(self, paused: bool) -> None:
        if self._paused != paused:
            self._paused = paused
            if self._timer is not None:
                if paused:
                    self._timer.pause()
                else:
                    self._timer.resume()
            if self.is_mounted:
                self._draw()

    def _tick(self) -> None:
        if not self._paused:
            self._frame += 1
            self._draw()

    def _draw(self) -> None:
        self.update(
            spinner_line(
                self._frame,
                self._message,
                self._hint,
                reduced_motion=self._reduced_motion,
                paused=self._paused,
            )
        )
