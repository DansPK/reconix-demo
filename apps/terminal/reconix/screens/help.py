"""Help overlay — the keys for the current screen, plus the global key map."""

from typing import List, Sequence, Tuple

from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.screen import ModalScreen, Screen
from textual.widgets import DataTable, OptionList, Static

from .. import theme
from ..widgets import ChoiceMenu, PromptInput

Row = Tuple[str, str]

GLOBAL_ROWS: List[Row] = [
    ("←  /  →", "previous / next screen in the flow"),
    ("1 … 8", "jump to a screen (when no menu has focus)"),
    ("/", "command suggestions (any screen)"),
    ("?", "toggle this help"),
    ("^O", "expand / collapse the steps Reconix finished"),
    ("^Q", "quit"),
]

PROMPT_ROWS: List[Row] = [
    ("/", "show command suggestions as you type"),
    ("↑  /  ↓", "prompt history, or move in the open menu"),
    ("Tab", "complete the highlighted command"),
    ("Enter", "send the request or run the command"),
    ("Esc", "close the menu, then clear the prompt"),
    ("^R", "search prompt history"),
]

LIST_ROWS: List[Row] = [
    ("↑  /  ↓", "move between choices"),
    ("Enter", "confirm the highlighted choice"),
]

MENU_ROWS: List[Row] = LIST_ROWS + [
    ("1 … 9", "pick a numbered choice"),
    ("type", "on \"Type something.\", write an answer, then Enter"),
]


def context_rows(screen: Screen) -> List[Row]:
    """Keys that work on `screen` right now: the focused widget's, then the screen's own."""
    focused = screen.focused
    if isinstance(focused, PromptInput):
        rows = list(PROMPT_ROWS)
    elif isinstance(focused, ChoiceMenu):
        rows = list(MENU_ROWS)
    elif isinstance(focused, (OptionList, DataTable)):
        rows = list(LIST_ROWS)
    else:
        rows = []
    seen = {desc for _, desc in rows}
    covered = {"enter", "up", "down"} if rows else set()   # already explained above
    for binding in type(screen).BINDINGS:
        if not isinstance(binding, Binding):
            binding = Binding(*binding)
        if binding.key in covered:
            continue
        if binding.description and binding.description not in seen:
            seen.add(binding.description)
            rows.append((screen.app.get_key_display(binding), binding.description))
    return rows


class HelpScreen(ModalScreen):
    BINDINGS = [
        Binding("question_mark", "close", "close", key_display="?"),
        Binding("escape", "close", "close"),
    ]

    def __init__(self, title: str = "⌨ Keyboard", rows: Sequence[Row] = ()) -> None:
        super().__init__()
        self._title = title
        self._rows = list(rows)

    @classmethod
    def for_screen(cls, screen: Screen) -> "HelpScreen":
        mode = getattr(screen, "mode_name", "")
        return cls(f"⌨ Shortcuts · {mode}" if mode else "⌨ Keyboard", context_rows(screen))

    def compose(self) -> ComposeResult:
        with Vertical(id="help-box") as box:
            box.border_title = self._title
            if self._rows:
                yield Static(Text("This screen", style=f"bold {theme.TEXT}"))
                yield from (self._row(keys, desc) for keys, desc in self._rows)
                yield Static("")
            yield Static(Text("Everywhere", style=f"bold {theme.TEXT}"))
            yield from (self._row(keys, desc) for keys, desc in GLOBAL_ROWS)
            yield Static("")
            yield Static(
                f"[{theme.DIM}]in-memory store · ? or Esc closes this[/]",
                markup=True,
            )

    @staticmethod
    def _row(keys: str, desc: str) -> Static:
        return Static(
            Text.assemble((f"{keys:<10}", f"bold {theme.CYAN}"), " ", (desc, theme.MUTED)))

    def action_close(self) -> None:
        self.app.pop_screen()
