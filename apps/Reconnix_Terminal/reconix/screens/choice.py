"""Dialog: a question with ↑/↓ choices. Also used for read-only details."""

from typing import List, Optional, Sequence, Tuple

from rich.console import RenderableType
from rich.table import Table
from rich.text import Text
from textual.actions import SkipAction
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical, VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import Static

from .. import theme
from ..models import Choice
from ..widgets import ChoiceMenu, Question, menu_hint


class ChoiceScreen(ModalScreen[Optional[str]]):
    """Dismisses with the chosen id, or None on Esc.

    There are deliberately no letter shortcuts: a stray key must never confirm
    a risky choice, and the default choice should be the safe one.
    """

    BINDINGS = [
        Binding("enter", "choose", "select", show=False),   # if focus is on the body
        Binding("escape", "cancel", "cancel"),
        # Priority, so long bodies scroll while the menu keeps focus.
        Binding("pageup", "scroll_body(-1)", "scroll up", show=False, priority=True),
        Binding("pagedown", "scroll_body(1)", "scroll down", show=False, priority=True),
    ]

    def __init__(
        self, title: str, question: str, choices: Sequence[Choice], *,
        body: Sequence[RenderableType] = (), default: int = 0, danger: bool = False,
        chip: str = "Question",
    ) -> None:
        super().__init__()
        self._title = title
        self._question = question
        self._choices = list(choices)
        self._body = list(body)
        self._default = default
        self._danger = danger
        self._chip = chip

    def compose(self) -> ComposeResult:
        with Vertical(classes="dialog danger" if self._danger else "dialog") as box:
            box.border_title = self._title
            if self._body:
                with VerticalScroll(classes="dialog-body"):
                    for renderable in self._body:
                        yield Static(renderable)
            # Risky dialogs are not numbered, so a stray digit can never pick "Yes".
            yield Question(
                self._chip, self._question, self._choices,
                hint=menu_hint("cancel"), default=self._default,
                numbered=not self._danger, typing=False, chat=False, danger=self._danger,
                menu_id="dialog-menu",
            )

    def on_mount(self) -> None:
        self.query_one("#dialog-menu", ChoiceMenu).focus()
        self.call_after_refresh(self._show_scroll_hint)

    def _show_scroll_hint(self) -> None:
        """Mention PgUp/PgDn only when the body is too long to fit."""
        if any(body.max_scroll_y > 0 for body in self.query(".dialog-body")):
            self.query_one(".menu-hint", Static).update(menu_hint("cancel", "PgUp/PgDn to scroll"))

    def on_choice_menu_chosen(self, event: ChoiceMenu.Chosen) -> None:
        event.stop()
        self.dismiss(event.choice_id)

    def action_choose(self) -> None:
        self.query_one("#dialog-menu", ChoiceMenu).choose_highlighted()

    def action_cancel(self) -> None:
        self.dismiss(None)

    def action_scroll_body(self, direction: int) -> None:
        for body in self.query(".dialog-body"):
            if direction > 0:
                body.scroll_page_down(animate=False)
            else:
                body.scroll_page_up(animate=False)
            return
        raise SkipAction()   # no body: let the menu handle the key


# (label, value, color)
DetailRow = Tuple[str, str, str]


def details_body(sections: Sequence[Tuple[str, Sequence[DetailRow]]]) -> List[RenderableType]:
    """Headings plus aligned label/value grids, for a read-only ChoiceScreen body."""
    body: List[RenderableType] = []
    for title, rows in sections:
        if body:
            body.append(Text(""))
        body.append(Text(title, style=f"bold {theme.TEXT}"))
        grid = Table.grid(padding=(0, 2))
        grid.add_column(style=theme.DIM, no_wrap=True, width=18)
        grid.add_column()
        for label, value, color in rows:
            grid.add_row(label, Text(value, style=color))
        body.append(grid)
    return body
