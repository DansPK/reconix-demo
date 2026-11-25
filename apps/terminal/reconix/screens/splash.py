"""The launch splash: the local web's preload animation, drawn in the terminal.

Like the web's splash (web/src/components/ui/reconix-splash.tsx), in four beats:

    in     the logo's rows come in one after another, their colour rising from the background
           while solid cells sharpen ░ ▒ ▓ → █ (the web's blur), over a soft glow
    tag    the two tagline lines fade up under the logo
    hold   everything rests for a moment
    exit   the tagline and glow fade while the logo glides onto the Start screen's own logo
           (measured, like the web measures its header logo), then the splash turns
           see-through and hands over to it without a jump

Shown once at launch, only with motion on (`widgets.motion`) and on a terminal big enough for
the logo. Any key or click skips it. Every frame comes from `splash_frame()`, a pure function,
so the tests can check any moment without a clock.
"""

import time
from functools import lru_cache
from typing import List, Optional, Tuple

from rich.style import Style
from rich.text import Text
from textual.app import ComposeResult
from textual.color import Color
from textual.events import Click, Key
from textual.screen import ModalScreen
from textual.widgets import Static

from .. import theme
from ..widgets.motion import blend, blend_style

LOGO = (
    "██████╗ ███████╗ ██████╗ ██████╗ ███╗   ██╗██╗██╗  ██╗",
    "██╔══██╗██╔════╝██╔════╝██╔═══██╗████╗  ██║██║╚██╗██╔╝",
    "██████╔╝█████╗  ██║     ██║   ██║██╔██╗ ██║██║ ╚███╔╝ ",
    "██╔══██╗██╔══╝  ██║     ██║   ██║██║╚██╗██║██║ ██╔██╗ ",
    "██║  ██║███████╗╚██████╗╚██████╔╝██║ ╚████║██║██╔╝ ██╗",
    "╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝",
)
LOGO_WIDTH = max(len(row) for row in LOGO)
TAGLINE = (
    ("AI-planned security assessments inside an approved scope.", theme.TEXT),
    ("From scope manifest to report, every step approved by you.", theme.MUTED),
)

# Timeline in seconds (the web's, a little slower so it reads in a terminal)
ROW_STAGGER = 0.08
ROW_SECONDS = 0.7
TAG_START = 0.45
TAG_SECONDS = 0.8
GLOW_SECONDS = 1.0
HOLD_UNTIL = 2.0
EXIT_SECONDS = 1.0
TOTAL_SECONDS = HOLD_UNTIL + EXIT_SECONDS

MIN_SIZE = (LOGO_WIDTH + 6, 16)  # smaller terminals skip the splash
SHADES = ("░", "▒", "▓")  # the "blur" a solid cell passes through before it is █
GLOW_STEPS = 48  # glow levels: neighbouring cells share a style, so frames stay cheap

Cell = Tuple[str, Optional[str], Optional[str]]  # (char, foreground style, background colour)


def _clamp(p: float) -> float:
    return min(1.0, max(0.0, p))


def _ease_out(p: float) -> float:
    """Ease-out cubic: quick to start, a soft landing (no sudden jump on the first frame)."""
    p = _clamp(p)
    return 1 - (1 - p) ** 3


def _ease_in_out(p: float) -> float:
    """Ease-in-out cubic: for the brand's glide, so it leaves and lands gently."""
    p = _clamp(p)
    return 4 * p * p * p if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2


def _progress(t: float, start: float, seconds: float) -> float:
    return _ease_out((t - start) / seconds) if t > start else 0.0


def fits(width: int, height: int) -> bool:
    return width >= MIN_SIZE[0] and height >= MIN_SIZE[1]


def _layout(width: int, height: int) -> Tuple[int, int]:
    """(left, top) of the logo, centred with the tagline under it."""
    block = len(LOGO) + 1 + len(TAGLINE)
    return max(0, (width - LOGO_WIDTH) // 2), max(0, (height - block) // 2 - 1)


@lru_cache(maxsize=4)
def _falloff(width: int, height: int) -> Tuple[Tuple[float, ...], ...]:
    """The glow's shape for this size, worked out once: 0 at the edge of the ellipse, 1 at
    its centre (squared, so it fades softly)."""
    left, top = _layout(width, height)
    cx, cy = left + LOGO_WIDTH / 2, top + len(LOGO) / 2
    rows = []
    for y in range(height):
        row = []
        for x in range(width):
            dx, dy = (x - cx) / (LOGO_WIDTH * 0.85), (y - cy) / 7.5
            f = max(0.0, 1 - (dx * dx + dy * dy) ** 0.5)
            row.append(f * f)
        rows.append(tuple(row))
    return tuple(rows)


@lru_cache(maxsize=GLOW_STEPS + 1)
def _glow_color(level: int) -> str:
    return blend(theme.BG, theme.CYAN_DIM, 0.55 * level / GLOW_STEPS)


def _logo_cell(char: str, col: int, seen: float) -> Tuple[str, str]:
    """One logo character `seen` of the way visible (0..1): the colour rises smoothly from
    the background, and a solid cell passes through ░ ▒ ▓ on its way to █."""
    base = blend(theme.CYAN, theme.TEAL, col / max(1, LOGO_WIDTH - 1))
    if char == "█":
        glyph = "█" if seen >= 0.75 else SHADES[min(2, int(seen / 0.25))]
        return glyph, "bold " + blend_style(base, theme.BG, 1 - seen)
    shadow = blend_style(base, theme.BG, 0.35)
    return char, blend_style(shadow, theme.BG, 1 - seen)


def splash_frame(
    t: float, width: int, height: int, land_at: Optional[Tuple[int, int]] = None
) -> Text:
    """The whole splash at `t` seconds, `width` x `height` cells.

    `land_at` is the top-left cell of the Start screen's own logo: in the exit the logo glides
    there and stays solid, so it hands over to that logo without a jump. Without it (the Start
    logo is not on screen) the logo fades out where it is."""
    grid: List[List[Cell]] = [[(" ", None, None)] * width for _ in range(height)]
    left, top = _layout(width, height)
    out_p = _clamp((t - HOLD_UNTIL) / EXIT_SECONDS) if t > HOLD_UNTIL else 0.0

    # the glow: grows with the logo, gone in the first half of the exit
    strength = _progress(t, 0.0, GLOW_SECONDS) * (1 - _ease_out(out_p * 2))
    if strength > 0:
        for y, row in enumerate(_falloff(width, height)):
            for x, f in enumerate(row):
                level = round(f * strength * GLOW_STEPS)
                if level > 0:
                    grid[y][x] = (" ", None, _glow_color(level))

    def put(x: int, y: int, char: str, style: str) -> None:
        if 0 <= x < width and 0 <= y < height:
            grid[y][x] = (char, style, grid[y][x][2])

    # the logo: rows come in one after another; in the exit it glides onto the Start logo
    # (or, with nowhere to land, fades out where it is)
    logo_out = 0.0 if land_at else _ease_out(out_p / 0.7)
    lx, ly = left, top
    if land_at and out_p > 0:
        glide = _ease_in_out(out_p / 0.75)
        lx = round(left + (land_at[0] - left) * glide)
        ly = round(top + (land_at[1] - top) * glide)
    if logo_out < 1:
        for row, line in enumerate(LOGO):
            seen = _progress(t, row * ROW_STAGGER, ROW_SECONDS) * (1 - logo_out)
            if seen <= 0.02:
                continue
            for col, char in enumerate(line):
                if char != " ":
                    glyph, style = _logo_cell(char, col, seen)
                    put(lx + col, ly + row, glyph, style)

    # the tagline: fades up under the logo, and is the first thing to go
    tag_p = _progress(t, TAG_START, TAG_SECONDS) * (1 - _ease_out(out_p * 3))
    if tag_p > 0.02:
        for index, (line, color) in enumerate(TAGLINE):
            x = max(0, (width - len(line)) // 2)
            style = blend(theme.BG, color, tag_p)
            for offset, char in enumerate(line):
                put(x + offset, top + len(LOGO) + 1 + index, char, style)

    return _to_text(grid)


def _to_text(grid: List[List[Cell]]) -> Text:
    """The grid as one Text, neighbouring cells with the same look joined into one span."""
    out = Text(no_wrap=True, overflow="crop")
    for y, row in enumerate(grid):
        if y:
            out.append("\n")
        run, run_key = "", None
        for char, fg, bg in row:
            key = (fg or "", bg or "")
            if key != run_key and run:
                out.append(run, style=_style(*run_key))  # type: ignore[misc]
                run = ""
            run_key = key
            run += char
        if run:
            out.append(run, style=_style(*run_key))  # type: ignore[misc]
    return out


def _style(fg: str, bg: str) -> Style:
    style = Style.parse(fg) if fg else Style()
    return style + Style(bgcolor=bg) if bg else style


class SplashScreen(ModalScreen[None]):
    """The launch splash over the Start screen; dismisses itself (or on any key or click)."""

    FPS = 50  # a frame costs little (the glow is cached, an unchanged frame is skipped)

    DEFAULT_CSS = """
    SplashScreen { background: $bg; }
    SplashScreen > #splash-canvas { width: 100%; height: 100%; background: transparent; }
    """

    def __init__(self) -> None:
        super().__init__()
        self._started = 0.0
        self._revealing = False
        self._done = False
        self._land_at: Optional[Tuple[int, int]] = None
        self._measured = False
        self._last: Optional[Text] = None

    def compose(self) -> ComposeResult:
        yield Static(id="splash-canvas")

    def on_mount(self) -> None:
        self._started = time.monotonic()
        self._draw()
        self.set_interval(1 / self.FPS, self._draw)

    def _elapsed(self) -> float:
        return time.monotonic() - self._started

    def _start_logo(self) -> Optional[Tuple[int, int]]:
        """Where the Start screen under this splash draws its logo (top-left cell), or None
        when it has none on screen (a conversation, a short terminal)."""
        for screen in reversed(self.app.screen_stack[:-1]):
            logos = screen.query("#logo")
            if logos:
                region = logos.first().content_region
                return (region.x, region.y) if region.width and region.height else None
        return None

    def _draw(self) -> None:
        if self._done:
            return
        t = self._elapsed()
        if t >= TOTAL_SECONDS:
            self._finish()
            return
        if t >= HOLD_UNTIL and not self._measured:
            self._measured = True  # laid out by now: measure once, as the exit starts
            self._land_at = self._start_logo()
        reveal_at = HOLD_UNTIL + EXIT_SECONDS * (0.7 if self._land_at else 0.3)
        if t > reveal_at and not self._revealing:
            self._revealing = True  # the logo has landed: show the Start screen through
            self.styles.animate(
                "background",
                Color.parse(theme.BG).with_alpha(0.0),
                duration=max(0.05, TOTAL_SECONDS - reveal_at),
                easing="in_out_cubic",
            )
        canvas = self.query_one("#splash-canvas", Static)
        frame = splash_frame(
            t, canvas.size.width or 80, canvas.size.height or 24, self._land_at
        )
        if frame != self._last:  # the hold draws the same frame many times over
            self._last = frame
            canvas.update(frame)

    def _finish(self) -> None:
        if not self._done:
            self._done = True
            self.dismiss(None)

    def on_key(self, event: Key) -> None:
        event.stop()
        event.prevent_default()
        self._finish()

    def on_click(self, event: Click) -> None:
        event.stop()
        self._finish()
