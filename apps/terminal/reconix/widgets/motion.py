"""Motion: the small animations that make the TUI feel alive, all behind one switch.

Every animation here is decoration only: the final frame is always the plain, readable text,
so nothing a person must read depends on it. Motion is off when `ENABLED` is False (tests),
when Textual's animation level is "none" (`TEXTUAL_ANIMATIONS=none`), or when
`RECONIX_REDUCED_MOTION` is set.

    LogoShimmer   the start logo: a CYAN → TEAL gradient with a light band that sweeps across
                  it once on start, then again every few seconds
    TypeLine      a line of text that types itself in
    pulse_color   a breathing colour for the "you are here" dot in the flow progress line
    spin_glyph    a rotating glyph for a busy status in the session bar
    fade_in       a widget fades in (a screen body, a preview panel)
"""

import math
import os
import time
from typing import Optional

from rich.color import Color
from rich.color_triplet import ColorTriplet
from rich.text import Text
from textual.app import App
from textual.widget import Widget
from textual.widgets import Static

from .. import theme

ENABLED = True  # tests turn motion off (conftest `instant_ui`), like RunController.SPEED

SPIN_FRAMES = ("◐", "◓", "◑", "◒")


def motion_on(app: Optional[App]) -> bool:
    """Whether to animate: the switch, the person's reduced-motion wish and Textual's level."""
    if not ENABLED or os.environ.get("RECONIX_REDUCED_MOTION"):
        return False
    level = getattr(app, "animation_level", "full") if app is not None else "full"
    return level != "none"


# --- colour helpers ----------------------------------------------------------------------------
def _rgb(token: str) -> ColorTriplet:
    triplet = Color.parse(token).triplet
    assert triplet is not None
    return triplet


def blend(a: str, b: str, t: float) -> str:
    """A colour `t` of the way from token `a` to token `b` (0..1), as an rgb() style."""
    t = min(1.0, max(0.0, t))
    ca, cb = _rgb(a), _rgb(b)
    r, g, bl = (round(x + (y - x) * t) for x, y in zip(ca, cb))
    return f"rgb({r},{g},{bl})"


def pulse_color(now: Optional[float] = None, period: float = 3.0) -> str:
    """A colour that breathes between CYAN and CYAN_DIM, for the current-step dot."""
    now = time.monotonic() if now is None else now
    t = (math.sin(2 * math.pi * now / period) + 1) / 2
    return blend(theme.CYAN_DIM, theme.CYAN, 0.35 + 0.65 * t)


def spin_glyph(now: Optional[float] = None, fps: float = 3.0) -> str:
    """The frame of a small rotating glyph for a busy status."""
    now = time.monotonic() if now is None else now
    return SPIN_FRAMES[int(now * fps) % len(SPIN_FRAMES)]


def fade_in(widget: Widget, duration: float = 0.5) -> None:
    """Fade `widget` in from transparent (skipped, and left opaque, without motion)."""
    if not motion_on(widget.app):
        return
    widget.styles.opacity = 0.0
    widget.styles.animate("opacity", value=1.0, duration=duration, easing="out_cubic")


# --- the logo ----------------------------------------------------------------------------------
def shimmer_text(art: str, band: Optional[float], width: int = 0) -> Text:
    """`art` coloured CYAN → TEAL from left to right, with a light band centred on column
    `band` (None: no band). The box-drawing shadow characters stay a step darker."""
    lines = art.splitlines()
    width = width or max((len(line) for line in lines), default=1)
    out = Text(no_wrap=True)
    for row, line in enumerate(lines):
        if row:
            out.append("\n")
        for col, char in enumerate(line):
            if char == " ":
                out.append(char)
                continue
            base = blend(theme.CYAN, theme.TEAL, col / max(1, width - 1))
            solid = char == "█"
            if band is not None:
                distance = abs(col - row * 0.6 - band)  # a slight slant reads as light
                glow = max(0.0, 1 - distance / 6)
                if glow:
                    base = blend_style(base, theme.TEXT, glow * (0.85 if solid else 0.5))
            style = f"bold {base}" if solid else blend_style(base, theme.BG, 0.35)
            out.append(char, style=style)
    return out


def blend_style(rgb_style: str, token: str, t: float) -> str:
    """Blend an `rgb(r,g,b)` style (from `blend`) toward a theme token."""
    r, g, b = (int(x) for x in rgb_style[4:-1].split(","))
    target = _rgb(token)
    t = min(1.0, max(0.0, t))
    mixed = (round(x + (y - x) * t) for x, y in zip((r, g, b), target))
    return "rgb({},{},{})".format(*mixed)


class LogoShimmer(Static):
    """The start logo with a gradient and a sweeping light band.

    The band sweeps once on start and then every `REST` seconds; between sweeps the timer
    sleeps, so an idle start screen costs almost nothing.
    """

    FPS = 30
    SWEEP_SECONDS = 2.8
    REST = 10.0

    def __init__(self, art: str, *, id: Optional[str] = None) -> None:
        super().__init__(id=id, markup=False)
        self._art = art
        self._width = max((len(line) for line in art.splitlines()), default=1)
        self._sweep_started = 0.0
        self._timer = None

    def on_mount(self) -> None:
        self.update(shimmer_text(self._art, None, self._width))
        if motion_on(self.app):
            wait = getattr(self.app, "splash_seconds", 0.0)  # sweep as the splash lands
            if wait:
                self.set_timer(wait, self._start_sweep)
            else:
                self._start_sweep()

    def _start_sweep(self) -> None:
        self._sweep_started = time.monotonic()
        if self._timer is None:
            self._timer = self.set_interval(1 / self.FPS, self._tick)
        else:
            self._timer.resume()

    def _tick(self) -> None:
        elapsed = time.monotonic() - self._sweep_started
        if elapsed >= self.SWEEP_SECONDS:
            self.update(shimmer_text(self._art, None, self._width))
            if self._timer is not None:
                self._timer.pause()
            self.set_timer(self.REST, self._start_sweep)
            return
        progress = elapsed / self.SWEEP_SECONDS
        eased = progress * progress * (3 - 2 * progress)  # ease in and out
        band = -8 + eased * (self._width + 16)
        self.update(shimmer_text(self._art, band, self._width))


class TypeLine(Static):
    """A line that types itself in after `delay` seconds (shown whole without motion)."""

    CPS = 35  # characters a second

    def __init__(
        self,
        text: str,
        *,
        delay: float = 0.0,
        id: Optional[str] = None,
        classes: Optional[str] = None,
    ) -> None:
        super().__init__(id=id, classes=classes, markup=False)
        self._full = text
        self._shown = 0
        self._delay = delay
        self._timer = None
        self._started = 0.0

    @property
    def full_text(self) -> str:
        return self._full

    def on_mount(self) -> None:
        if not motion_on(self.app):
            self.update(self._full)
            return
        self.update("")
        delay = self._delay + getattr(self.app, "splash_seconds", 0.0)
        if delay:
            self.set_timer(delay, self._begin)
        else:
            self._begin()

    def _begin(self) -> None:
        self._started = time.monotonic()
        self._timer = self.set_interval(1 / 30, self._tick)

    def _tick(self) -> None:
        count = min(len(self._full), int((time.monotonic() - self._started) * self.CPS) + 1)
        if count != self._shown:
            self._shown = count
            cursor = "▌" if count < len(self._full) else ""
            self.update(Text.assemble(self._full[:count], (cursor, theme.CYAN)))
        if count >= len(self._full) and self._timer is not None:
            self._timer.stop()
            self._timer = None
