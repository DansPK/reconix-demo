---
name: add-widget
description: How to create or extract a reusable widget in reconix/widgets/ for the Reconix TUI. Use when the same markup or layout appears on two or more screens, or when building a new UI component (panel, badge row, key-value list, log view).
---

# Add a reusable widget

## When
- The same markup, layout, or behavior appears on two or more screens.
- A screen's `compose_body()` grows past about 60 lines because of one repeated block.

## Steps
1. **Pick a file by concern**: `chrome.py` (window chrome), `panels.py`,
   `badges.py`, `tables.py`, and so on. Do not grow one catch-all module.
2. **Write the widget**, matching `reconix/widgets/chrome.py`:
   - Module and class docstrings.
   - Take data through `__init__` arguments; never import `data` for content the caller should pass.
   - Colors from `theme.*`; layout and spacing in `reconix.tcss` using the class name as selector.
   - Recompute width-dependent rendering in `on_resize` (see `SessionBar`).
   - Escape any untrusted text (backend or tool output) with `rich.markup.escape` before putting it in markup.
3. **Export** it from `reconix/widgets/__init__.py` (import and `__all__`).
4. **Replace every duplicate** with the widget in the same change.
5. **Verify** with `python -m compileall -q reconix` and run the app or tests.

## Skeleton

```python
"""<What this widget is for>."""

from textual.widgets import Static

from .. import theme


class KeyValueRow(Static):
    """A dim label followed by a value, aligned in a fixed column."""

    def __init__(self, label: str, value: str, color: str = theme.TEXT, width: int = 12) -> None:
        super().__init__(
            f"[{theme.DIM}]{label:<{width}}[/][{color}]{value}[/]",
            markup=True,
        )
```
