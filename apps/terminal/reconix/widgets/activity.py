"""What Reconix is doing now: one spinner line; expanded (Ctrl+O), the steps it finished too."""

from typing import Optional, Sequence

from rich.text import Text

from .. import theme
from .spinner import Spinner, spinner_line

EXPAND_KEY = "ctrl+o"


class ActivityStatus(Spinner):
    """A `Spinner` over a list of steps: the last one spins, the earlier ones are done.

    Collapsed, only the current step shows (with a hint when finished steps are hidden);
    expanded, the finished steps are listed above it. `show(steps)` takes new steps and
    `set_expanded()` switches between the two (the app's Ctrl+O).
    """

    def __init__(self, steps: Sequence[str], placeholder: str, *, expanded: bool = False,
                 id: Optional[str] = None, classes: Optional[str] = None) -> None:
        super().__init__(placeholder, id=id, classes=classes)
        self._placeholder = placeholder
        self._done: Sequence[str] = ()
        self._expanded = expanded
        self._set_steps(steps)

    def _set_steps(self, steps: Sequence[str]) -> None:
        self._message = steps[-1] if steps else self._placeholder
        self._done = tuple(steps[:-1])

    def show(self, steps: Sequence[str]) -> None:
        self._set_steps(steps)
        self._draw()

    def set_expanded(self, expanded: bool) -> None:
        self._expanded = expanded
        self._draw()

    def _draw(self) -> None:
        text = Text()
        if self._expanded:
            for step in self._done:
                text.append("  ✓ ", style=theme.GREEN)
                text.append(step, style=theme.MUTED)
                text.append("\n")
        hint = ""
        if self._done:
            hint = f"{EXPAND_KEY} to {'collapse' if self._expanded else 'expand'}"
        text.append_text(spinner_line(self._frame, self._message, hint))
        self.update(text)
