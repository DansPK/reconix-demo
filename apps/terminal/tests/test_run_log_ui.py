"""The live output folds the work between messages into thinking blocks (Claude-style)."""

from reconix import store
from reconix.models import ThinkingItem
from reconix.store.transcript import add_activity
from reconix.widgets.run_log import RunLog
from reconix.widgets.thinking_block import ThinkingBlock

from .support import SIZE, decide, run_to_end, settle, show


def _finished_run() -> None:
    store.start_run(store.DEMO_REQUEST)
    run_to_end()


def _running_with_a_block_last() -> None:
    """Play the demo until it is running (no gate) and its newest entry is a step."""
    store.start_run(store.DEMO_REQUEST)
    while True:
        gate = store.waiting_gate()
        if gate:
            decide(gate)
        items = store.group_stream(store.stream(), "running")
        if (
            not store.waiting_gate()
            and items
            and isinstance(items[-1], ThinkingItem)
            and store.is_plan_started()
        ):
            return
        assert store.advance() is not None, "the run ended before a block was last"


async def test_finished_blocks_start_folded_to_their_title(app):
    _finished_run()
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "execution")
        blocks = list(app.screen.query(ThinkingBlock))
        assert blocks and not any(block.expanded for block in blocks)
        assert all(not block.query_one(".thinking-body").display for block in blocks)
        titles = [block.plain_lines(include_folded=False) for block in blocks]
        assert all(len(lines) == 1 for lines in titles)  # the title only
        assert any(lines[0].startswith("✓ Worked") for lines in titles)   # tests: no time


async def test_click_or_space_opens_one_block_and_a_redraw_keeps_it_open(app):
    _finished_run()
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "execution")
        first, second = list(app.screen.query(ThinkingBlock))[-2:]
        first.scroll_visible(animate=False)
        await settle(pilot)
        await pilot.click(first.query_one(".thinking-title"))
        await settle(pilot)
        assert first.expanded and first.query_one(".thinking-body").display
        assert not second.expanded
        second.query_one(".thinking-title").focus()
        await pilot.press("space")
        await settle(pilot)
        assert second.expanded
        app.refresh_view()  # a new step redraws the log
        await settle(pilot)
        assert first.expanded and second.expanded


async def test_ctrl_o_opens_and_folds_every_block(app):
    _finished_run()
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "execution")
        await pilot.press("ctrl+o")
        await settle(pilot)
        assert all(block.expanded for block in app.screen.query(ThinkingBlock))
        await pilot.press("ctrl+o")
        await settle(pilot)
        assert not any(block.expanded for block in app.screen.query(ThinkingBlock))


async def test_the_running_block_spins_and_shows_its_newest_step(app):
    _running_with_a_block_last()
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "execution")
        block = list(app.screen.query(ThinkingBlock))[-1]
        assert block.item.state == "running"
        title = block.plain_lines(include_folded=False)[0]
        assert "Working…" in title or "Thinking…" in title
        latest = str(block.query_one(".thinking-latest").render())
        assert block.query_one(".thinking-latest").display and latest.startswith("└ ")


async def test_a_step_with_markup_is_shown_literally(app):
    _finished_run()
    add_activity("TOOL", "[bold]x[/bold] [/oops]")
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "execution")
        text = "\n".join(app.screen.query_one(RunLog).plain_lines())
        assert "[bold]x[/bold] [/oops]" in text
