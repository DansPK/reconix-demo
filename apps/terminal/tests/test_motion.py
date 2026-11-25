"""Motion: decoration only. Off in tests by default (conftest), honours reduced motion, and
every animation ends on the plain, readable text."""

import asyncio

from reconix import theme
from reconix.app import ReconixApp
from reconix.widgets import FlowProgress, SeverityStrip, motion
from reconix.widgets.motion import LogoShimmer, TypeLine, shimmer_text

from .support import SIZE, settle, wait_until


def test_motion_is_off_in_tests_and_for_reduced_motion(monkeypatch):
    assert not motion.motion_on(None)
    monkeypatch.setattr(motion, "ENABLED", True)
    assert motion.motion_on(None)
    monkeypatch.setenv("RECONIX_REDUCED_MOTION", "1")
    assert not motion.motion_on(None)


def test_blend_runs_between_two_tokens():
    assert motion.blend(theme.BG, theme.TEXT, 0) == "rgb(11,15,18)"
    assert motion.blend(theme.BG, theme.TEXT, 1) == "rgb(230,237,240)"
    assert motion.blend(theme.BG, theme.TEXT, 7) == motion.blend(theme.BG, theme.TEXT, 1)


def _style_at(text, offset: int) -> str:
    return next(str(span.style) for span in text.spans if span.start <= offset < span.end)


def test_shimmer_keeps_the_art_and_lights_only_the_band():
    art = "█ █ █\n█ █ █"
    plain, lit, far = shimmer_text(art, None), shimmer_text(art, 0), shimmer_text(art, -50)
    assert plain.plain == lit.plain == far.plain == art
    assert _style_at(plain, 0) != _style_at(lit, 0)
    assert _style_at(plain, 4) == _style_at(far, 4)


def test_pulse_and_spin_cycle():
    assert motion.pulse_color(0.0) != motion.pulse_color(0.75)
    assert {motion.spin_glyph(i / 3) for i in range(4)} == set(motion.SPIN_FRAMES)


async def test_without_motion_the_start_screen_shows_everything_at_once():
    app = ReconixApp()
    async with app.run_test(size=SIZE) as pilot:
        await settle(pilot)
        assert isinstance(app.screen.query_one("#logo"), LogoShimmer)
        tagline = app.screen.query_one("#tagline", TypeLine)
        assert str(tagline.render()) == tagline.full_text
        assert not app.screen.query_one(FlowProgress)._moving


async def test_with_motion_the_tagline_types_in_and_ends_whole(monkeypatch):
    from reconix.screens import StartScreen

    monkeypatch.setattr(motion, "ENABLED", True)
    app = ReconixApp()
    async with app.run_test(size=SIZE) as pilot:
        start = next(s for s in app.screen_stack if isinstance(s, StartScreen))
        tagline = start.query_one("#tagline", TypeLine)  # under the launch splash
        assert start.query_one(FlowProgress)._moving
        await pilot.press("escape")  # skip the splash; the tagline still types in after it
        await wait_until(
            pilot,
            lambda: str(tagline.render()) == tagline.full_text,
            timeout=8,
            what="the tagline to finish typing",
        )


async def test_the_severity_strip_counts_up_to_the_real_numbers(monkeypatch):
    monkeypatch.setattr(motion, "ENABLED", True)
    target = {"CRITICAL": 4, "HIGH": 9}
    app = ReconixApp()
    async with app.run_test(size=SIZE) as pilot:
        strip = SeverityStrip()
        await app.screen.mount(strip)
        strip.show(target)
        await asyncio.sleep(0.05)
        assert strip._shown != target  # still counting
        await wait_until(pilot, lambda: strip._shown == target, timeout=3, what="the count-up")
        assert "CRITICAL 4" in str(strip.render())
