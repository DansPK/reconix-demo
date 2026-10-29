"""A human-in-the-loop question, drawn like Claude Code's: chip, question, choices, hint."""

from typing import Optional, Sequence

from rich.text import Text
from textual.app import ComposeResult
from textual.containers import Vertical
from textual.widgets import Static

from ..models import Choice
from .choice_menu import ChoiceMenu, menu_hint

TYPE_SOMETHING = Choice("type", "Type something.", kind="input")
CHAT_ABOUT_THIS = Choice("chat", "Chat about this", separated=True)


class Question(Vertical):
    """A decision the operator makes before Reconix continues.

    Unless turned off, it adds Claude Code's two standard rows: "Type something."
    (free text, posted as `ChoiceMenu.Typed`) and "Chat about this" (choice id "chat").
    Choices arrive as `ChoiceMenu.Chosen`.
    """

    def __init__(
        self, chip: str, question: str, choices: Sequence[Choice], *,
        hint: str = "", default: int = 0, numbered: Optional[bool] = None,
        typing: bool = True, chat: bool = True, danger: bool = False,
        menu_id: Optional[str] = None, id: Optional[str] = None,
    ) -> None:
        super().__init__(id=id, classes="danger" if danger else None)
        self._chip = chip
        self._question = question
        self._choices = (list(choices) + ([TYPE_SOMETHING] if typing else [])
                         + ([CHAT_ABOUT_THIS] if chat else []))
        self._hint = hint or menu_hint()
        self._default = default
        self._numbered = numbered
        self._menu_id = menu_id

    def compose(self) -> ComposeResult:
        yield Static(Text(f"☐ {self._chip}"), classes="chip")
        if self._question:
            yield Static(Text(self._question), classes="question")
        yield ChoiceMenu(self._choices, default=self._default, numbered=self._numbered,
                         id=self._menu_id)
        yield Static(self._hint, classes="menu-hint", markup=True)

    @property
    def menu(self) -> ChoiceMenu:
        return self.query_one(ChoiceMenu)
