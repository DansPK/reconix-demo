---
name: add-screen
description: Checklist for adding a new screen (flow frame or overlay) to the Reconix TUI so it is wired into navigation, bindings, help, and docs correctly. Use whenever creating a new file under reconix/screens/.
---

# Add a screen to Reconix

## 1. Plan (write it down before coding)
- Screen key (`flow_name`), footer chip (`mode_name`), and its position in `FLOW`.
- Data it needs, and whether those fields already exist in `reconix/models/` and `reconix/store/`.
- Bindings: primary (`enter`), back (`escape`), plus screen-specific keys.
- Reusable pieces: existing widgets or theme helpers, or new widgets to extract.

## 2. Data first
Add new dataclasses to `reconix/models/`, demo rows to `reconix/store/seed.py`
(plus a list in `store/lists.py` if needed), and read/add functions to the
matching `reconix/store/<resource>.py`, exported from `store/__init__.py`.
Screens contain no data literals.

## 3. Create `reconix/screens/<name>.py`

```python
"""Frame NN — <Human name>."""

from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.widgets import Static

from .base import ReconixScreen
from .. import store, theme


class <Name>Screen(ReconixScreen):
    flow_name = "<name>"
    mode_name = "<MODE>"
    # scroll = False   # only if the body should fill instead of scroll

    BINDINGS = [
        Binding("enter", "next", "continue"),
        Binding("escape", "prev", "back", show=False),
    ]

    def compose_body(self) -> ComposeResult:
        yield Static(
            f"[{theme.CYAN}]◆ reconix[/] [{theme.DIM}]…[/]",
            classes="ai-label", markup=True,
        )
        with Vertical(classes="panel") as panel:
            panel.border_title = "◆ TITLE"
            ...
```

`action_next` and `action_prev` are inherited from `ReconixScreen`.

If the screen asks the operator something, use a `ChoiceMenu` (and
`menu_hint()`) instead of buttons, handle `on_choice_menu_chosen`, and add
`Binding("enter", "choose", "select", show=False)`. Pop-up questions use
`ChoiceScreen` with the safe choice as the default.

## 4. Wire it up
- [ ] Export from `reconix/screens/__init__.py` (import and `__all__`).
- [ ] Add `("<name>", <Name>Screen)` to `FLOW` in `reconix/app.py`, in order.
- [ ] Add or renumber the `1…N` jump bindings in `ReconixApp.BINDINGS`.
- [ ] Add styles to `reconix/reconix.tcss` using `$tokens` only.
- [ ] Give every binding a description (contextual help lists them) and update
      the README "Keys" and "Project layout" sections. Add a `/command` in
      `reconix/commands/builtin.py` if the screen should be reachable by name.
- [ ] If the screen performs a HIGH-risk action, route it through the approval gate.

## 5. Verify
```bash
.venv/bin/python -m compileall -q reconix
.venv/bin/python -c "from reconix.app import ReconixApp"
.venv/bin/pytest -q            # if tests exist; add a navigation test for the new screen
```
