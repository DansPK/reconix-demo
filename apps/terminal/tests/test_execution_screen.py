"""The Execution screen: loading without percentages, and a live output that's easy to watch."""

import re

from textual.widgets import Static

from reconix import store
from reconix.screens import ExecutionScreen
from reconix.widgets.run_log import RunLog
from reconix.widgets.spinner import Spinner
from reconix.widgets.thinking_block import ThinkingBlock

from .support import SIZE, decide, play_until_gate, settle, show

STEP = re.compile(r"^\d\d:\d\d:\d\d UTC  (ai|policy|tool|you|system) +\S")


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
    return " ".join(texts + log.plain_lines())


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
    gate = _testing_at_first_approval()              # waiting at the single approval gate
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "execution")
        spinner = app.screen.query_one("#exec-spinner", Spinner)
        assert not spinner.display                   # paused at the gate: no spinner
        assert "paused · waiting for you" in _shown(app)
        decide(gate)                                 # approve it; validation runs on
        for _ in range(3):
            store.advance()
        app.refresh_view()
        await settle(pilot)
        assert spinner.display
        assert "Finding validation…" in str(spinner.render())
        assert "^C to stop" in str(spinner.render())


async def test_every_step_reads_time_who_message(app):
    _testing_running()
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "execution")
        blocks = app.screen.query(ThinkingBlock)
        steps = [line for block in blocks for line in block.plain_lines()[1:]]
        assert steps and all(STEP.match(line) for line in steps)
        assert not any("[POLICY]" in line for line in steps)


async def test_messages_carry_no_name_in_front(app):
    _testing_running()
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "execution")
        messages = [str(w.render()) for w in app.screen.query(".message-line")]
        assert messages and any(m.startswith("◆ ") for m in messages)
        assert not any(m.startswith(("reconix", "you ")) for m in messages)


async def test_scrolling_up_stops_following_until_end(app):
    _testing_running()
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "execution")
        await pilot.press("ctrl+o")                        # open every block: enough to scroll
        await settle(pilot)
        log = app.screen.query_one(RunLog)
        assert log.max_scroll_y > 0 and log.following
        log.focus()
        await pilot.press("end")                           # at the newest line first
        await settle(pilot)
        await pilot.wait_for_animation()
        await pilot.press("pageup")
        await settle(pilot)
        await pilot.wait_for_animation()      # PageUp scrolls animated: let it land
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
