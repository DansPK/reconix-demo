"""The launch splash (screens/splash.py): the web's preload animation in the terminal.

Frames come from a pure function, so each beat is checked at a fixed time; the screen is
checked in the app: it plays only with motion on and room for it, and any key skips it."""

from reconix.app import ReconixApp
from reconix.screens import StartScreen
from reconix.screens import splash
from reconix.screens.splash import LOGO, TAGLINE, SplashScreen, splash_frame
from reconix.widgets import motion

from .support import settle, wait_until

W, H = 110, 30


def _lines(t: float) -> list:
    return splash_frame(t, W, H).plain.split("\n")


def test_every_frame_fills_the_screen_exactly():
    for t in (0.0, 0.2, 1.0, splash.HOLD_UNTIL + 0.3, splash.TOTAL_SECONDS):
        lines = _lines(t)
        assert len(lines) == H and all(len(line) == W for line in lines)


def test_it_starts_empty_and_the_logo_sharpens_into_place():
    assert not "".join(_lines(0.0)).strip()
    early = "\n".join(_lines(0.15))
    assert "░" in early or "▒" in early or "▓" in early  # still "blurred"
    held = _lines(1.5)
    for row in LOGO:
        assert any(row.rstrip() in line for line in held)  # whole and solid by the hold


def test_the_tagline_fades_up_under_the_logo():
    assert not any(TAGLINE[0][0] in line for line in _lines(0.2))
    assert any(TAGLINE[0][0] in line for line in _lines(1.5))
    assert any(TAGLINE[1][0] in line for line in _lines(1.5))


def test_on_exit_the_logo_lands_exactly_on_the_start_logo():
    land = (7, 3)
    last = splash_frame(splash.TOTAL_SECONDS, W, H, land).plain.split("\n")
    for row, line in enumerate(LOGO):
        assert last[land[1] + row][land[0]:land[0] + len(line)] == line  # solid, in place
    assert not any(TAGLINE[0][0] in line for line in last)  # the tagline has gone


def test_the_glide_moves_a_cell_at_a_time_without_skipping_back():
    land = (7, 3)
    tops = []
    for step in range(31):
        t = splash.HOLD_UNTIL + splash.EXIT_SECONDS * step / 30
        lines = splash_frame(t, W, H, land).plain.split("\n")
        tops.append(next(i for i, line in enumerate(lines) if LOGO[0] in line))
    assert tops[0] > land[1] and tops[-1] == land[1]
    assert all(b <= a for a, b in zip(tops, tops[1:]))  # always towards the target


def test_with_nowhere_to_land_the_logo_fades_out():
    last = splash_frame(splash.TOTAL_SECONDS, W, H)
    assert not any("█" in line for line in last.plain.split("\n"))


def test_a_small_terminal_has_no_room_for_it():
    assert splash.fits(120, 36)
    assert splash.fits(80, 24)
    assert not splash.fits(56, 14)


async def test_without_motion_there_is_no_splash():
    app = ReconixApp()
    async with app.run_test(size=(120, 36)) as pilot:
        await settle(pilot)
        assert isinstance(app.screen, StartScreen)
        assert app.splash_seconds == 0


async def test_with_motion_it_plays_over_start_and_a_key_skips_it(monkeypatch):
    monkeypatch.setattr(motion, "ENABLED", True)
    monkeypatch.setattr(splash, "HOLD_UNTIL", 60.0)  # long enough to never end by itself here
    monkeypatch.setattr(splash, "TOTAL_SECONDS", 61.0)
    app = ReconixApp()
    async with app.run_test(size=(120, 36)) as pilot:
        await settle(pilot)
        assert isinstance(app.screen, SplashScreen)
        assert isinstance(app.screen_stack[-2], StartScreen)
        await pilot.press("x")
        await settle(pilot)
        assert isinstance(app.screen, StartScreen)
        assert "x" not in app.screen.query_one("PromptBox").input.value  # the key was eaten


async def test_with_motion_it_ends_by_itself(monkeypatch):
    monkeypatch.setattr(motion, "ENABLED", True)
    monkeypatch.setattr(splash, "HOLD_UNTIL", 0.05)
    monkeypatch.setattr(splash, "EXIT_SECONDS", 0.05)
    monkeypatch.setattr(splash, "TOTAL_SECONDS", 0.1)
    app = ReconixApp()
    async with app.run_test(size=(120, 36)) as pilot:
        await wait_until(
            pilot, lambda: isinstance(app.screen, StartScreen), timeout=3, what="the splash to end"
        )


async def test_with_motion_a_small_terminal_goes_straight_to_start(monkeypatch):
    monkeypatch.setattr(motion, "ENABLED", True)
    app = ReconixApp()
    async with app.run_test(size=(56, 14)) as pilot:
        await settle(pilot)
        assert isinstance(app.screen, StartScreen)
