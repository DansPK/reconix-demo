"""The Execution screen: loading without percentages, and a live output that's easy to watch."""

import re

from textual.widgets import Static

from reconix import store
from reconix.screens import ExecutionScreen
from reconix.widgets import RunLog, Spinner

from .support import SIZE, decide, play_until_gate, settle, show

LINE = re.compile(r"^\d\d:\d\d:\d\d  (reconix|policy|tool|you|system|) +\S")


def _testing_at_first_approval() -> str:
    """Play the demo through the store until it waits at its first approval."""
    store.start_run(store.DEMO_REQUEST)
    gate = play_until_gate()
    while gate and not gate.startswith("approval:"):
        decide(gate)
        gate = play_until_gate()
    return gate


def _testing_running() -> None:
    """Past the first approval, a few steps into testing, not waiting at a gate."""
    decide(_testing_at_first_approval())
    for _ in range(3):
        store.advance()
    assert not store.waiting_gate()


def _shown(app) -> str:
    texts = [str(w.render()) for w in app.screen.query(Static)]
    log = app.screen.query_one(RunLog)
    return " ".join(texts + [str(line.text) for line in log.lines])


async def test_nothing_on_the_screen_is_a_percentage(app):
    _testing_running()
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "execution")
        assert isinstance(app.screen, ExecutionScreen)
        assert "running…" in _shown(app) and "%" not in _shown(app)
        while play_until_gate():                         # to the end
            decide(store.waiting_gate())
        app.refresh_view()
        await settle(pilot)
        assert store.is_completed() and "%" not in _shown(app)


async def test_the_spinner_shows_while_running_and_hides_when_paused(app):
    _testing_running()
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "execution")
        spinner = app.screen.query_one("#exec-spinner", Spinner)
        assert spinner.display
        assert "Validate access controls…" in str(spinner.render())
        assert "^C to stop" in str(spinner.render())
        play_until_gate()                                    # the HIGH approval
        app.refresh_view()
        await settle(pilot)
        assert not spinner.display
        assert "paused · waiting for you" in _shown(app)


async def test_every_log_line_reads_time_who_message(app):
    _testing_running()
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "execution")
        lines = [str(line.text) for line in app.screen.query_one(RunLog).lines]
        starts = [line for line in lines if not line.startswith(" ")]   # not a wrapped line
        assert starts and all(LINE.match(line) for line in starts)
        assert not any("[POLICY]" in line or "◆" in line for line in lines)


async def test_scrolling_up_stops_following_until_end(app):
    _testing_running()
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "execution")
        log = app.screen.query_one(RunLog)
        assert log.max_scroll_y > 0 and log.following
        log.focus()
        await pilot.press("pageup")
        await settle(pilot)
        assert not log.following
        top = log.scroll_y
        for _ in range(4):
            store.advance()
        app.refresh_view()
        await settle(pilot)
        assert log.scroll_y == top and log.unseen > 0          # it stayed where you read
        assert "new · End to follow" in str(log.border_subtitle)
        await pilot.press("end")
        await settle(pilot)
        assert log.following and log.unseen == 0 and log.is_vertical_scroll_end
        assert "End to follow" not in str(log.border_subtitle)
