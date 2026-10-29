---
name: write-tui-test
description: Patterns for testing the Reconix TUI with pytest, pytest-asyncio, and Textual's App.run_test()/Pilot, including navigation, ↑/↓ menus, the slash-command prompt, the two-step approval gate, and dialogs. Use when writing, fixing, or extending tests.
---

# Testing the Reconix TUI

## Harness (already set up)

- `requirements-dev.txt` adds `pytest` and `pytest-asyncio`. Install it with
  `pip install -r requirements-dev.txt`.
- `pyproject.toml` sets `asyncio_mode = "auto"`, `testpaths = ["tests"]` and
  `pythonpath = ["."]`.
- `tests/conftest.py` has an autouse fixture that calls `store.reset()` before
  and after every test (the store lists are process-wide). It also provides an
  `app` fixture.
- `tests/support.py` provides:
  - `SIZE`, a fixed terminal size.
  - `show(app, pilot, name)`, which jumps to a flow screen.
  - `event_kinds()`, which returns the audit event kinds.

Files are organised one per area: `test_navigation.py`, `test_prompt.py`,
`test_command_bar.py`, `test_gates.py`, `test_approval.py`, `test_help.py`,
`test_commands.py`, `test_history.py` and `test_store_approval.py`.

Run the suite with `.venv/bin/pytest -q` and report the real output.

## Patterns

**Navigation**
```python
from reconix.screens import PlanScreen

from .support import SIZE, show


async def test_arrows_walk_the_flow(app):
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "scope")     # Start's focused prompt eats ←/→ and digits
        await pilot.press("right")
        await pilot.pause()
        assert isinstance(app.screen, PlanScreen)
```

**↑/↓ menus**: assert on state, not on rendering.
```python
from reconix.widgets import ChoiceMenu

from .support import SIZE, event_kinds, show


async def test_scope_reject_from_the_menu(app):
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "scope")
        assert isinstance(app.focused, ChoiceMenu)
        await pilot.press("down", "down", "enter")
        await pilot.pause()
        assert event_kinds() == ["scope.rejected"]
```

**Slash prompt** (Start). Use `"slash"` as the key name for `/`.
```python
from reconix.screens import FindingsListScreen
from reconix.widgets import PromptBox


async def test_slash_filters_and_runs(app):
    async with app.run_test(size=SIZE) as pilot:
        box = app.screen.query_one(PromptBox)
        before = box.input.region
        await pilot.press("slash", "f", "i")
        await pilot.pause()
        assert box.menu.highlighted_id == "findings"
        assert box.input.region == before            # suggestions float above; input never moves
        await pilot.press("enter")
        await pilot.pause()
        assert isinstance(app.screen, FindingsListScreen)
```
To type text with brackets or spaces, set `box.input.value = "..."`, then press `enter`.

**Questions** (Claude-style): digits pick, and the "Type something." row takes typing.
```python
async def test_type_something_saves_feedback(app):
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "scope")
        await pilot.press("4", "o", "k", "enter")    # 4 = Type something.
        await pilot.pause()
        assert store.list_feedback()[-1].text == "ok"
```

**Approval gate**: two steps for HIGH risk, and the default is "No".
```python
from reconix.screens import ExecutionScreen


async def test_yes_approves(app):
    async with app.run_test(size=SIZE) as pilot:
        await show(app, pilot, "approval")
        depth = len(app.screen_stack)
        await pilot.press("enter")                   # Approve & run -> confirmation dialog
        await pilot.pause()
        assert app.screen.query_one(ChoiceMenu).highlighted_id == "no"
        await pilot.press("down", "enter")           # Yes, run it
        await pilot.pause()
        assert isinstance(app.screen, ExecutionScreen)
        assert len(app.screen_stack) == depth        # every dialog path restores the stack
```
To test the store rules directly:
```python
token = store.request_confirmation(req.request_id, req.command_hash)
store.approve(req.request_id, command_hash=req.command_hash, confirmation_token=token)
```
Calling `approve` without a token raises `StoreValidationError`.

## Rules
- Always pass `size=SIZE`, so layout-dependent widgets behave the same everywhere.
- After key presses that switch screens or open dialogs, `await pilot.pause()`. Never use `time.sleep`.
- `run_test` turns notifications off. Assert on screens, store lists, focus and
  regions, not on toasts.
- After closing any modal, check that `len(app.screen_stack)` is back to its
  starting value. A dialog that never dismisses leaks.
- Animated screens (execution) use timers. Assert on the final state after
  `await pilot.pause(delay)`, or press Enter to finish early.
- When a backend exists, mock the network with `respx` or by monkeypatching the store module.
