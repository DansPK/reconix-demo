"""Help overlay — the keys for the current screen, plus the global key map."""

from typing import List, Sequence, Tuple

from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, VerticalScroll
from textual.screen import ModalScreen, Screen
from textual.widgets import DataTable, OptionList, Static

from .. import theme
from ..widgets import ChoiceMenu, PromptInput

Row = Tuple[str, str]

# Keys of the flow screens. Inside a dialog (a menu or a form) its own keys apply instead,
# so "/" and "?" typed into a field stay text; the rows say where a key does not reach.
GLOBAL_ROWS: List[Row] = [
    ("←  /  →", "previous / next step, unless you are typing; → waits at a step that still "
                "needs your choice; Esc closes a chat first"),
    ("Alt+1 … 8", "jump to a screen"),
    ("/", "command suggestions (not inside a dialog); in a chat, start a line with / to "
          "run a command"),
    ("?", "toggle this help (not inside a dialog; on the prompt when it is empty)"),
    ("^C", "stop the running assessment (asks first; copies selected text in a field)"),
    ("^O", "expand / collapse the steps Reconix finished (click one to open it)"),
    ("^Y", "copy the selected text (drag with the mouse to select) to the clipboard"),
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
    ("1 … 9", "pick a numbered choice (a red, unnumbered one needs ↑/↓ and Enter)"),
    ("type", "on \"Type something.\", write it, then Enter"),
]

# Textual's short key names, written the way the rows above write them.
KEY_NAMES = {"⏎": "Enter", "esc": "Esc", "tab": "Tab", "end": "End"}


def _bindings(owner: type) -> List[Binding]:
    return [b if isinstance(b, Binding) else Binding(*b) for b in owner.BINDINGS]


def key_label(screen: Screen, binding: Binding) -> str:
    """How a binding's key reads in the help: Enter, Esc, ^C, …"""
    label = screen.app.get_key_display(binding)
    if label.startswith("^"):
        return label.upper()
    return KEY_NAMES.get(label, label)


def context_rows(screen: Screen) -> List[Row]:
    """Keys that work on `screen` right now: the focused widget's, then the screen's own."""
    focused = screen.focused
    if isinstance(focused, PromptInput):
        rows = list(PROMPT_ROWS)
    elif isinstance(focused, ChoiceMenu):
        typing = any(choice.kind == "input" for choice in focused._choices)
        rows = [row for row in MENU_ROWS if typing or row[0] != "type"]
    elif isinstance(focused, DataTable):
        rows = LIST_ROWS[:1]          # Enter is the screen's own (e.g. "open finding")
    elif isinstance(focused, OptionList):
        rows = list(LIST_ROWS)
    else:
        rows = []
    seen = {desc for _, desc in rows}
    covered = {"up", "down"} if rows else set()   # already explained above
    if any(keys == "Enter" for keys, _ in rows):
        covered.add("enter")
    # A screen key that does what the app's key does is already in "Everywhere".
    global_keys = {(b.key, b.action) for b in _bindings(type(screen.app))}
    for binding in _bindings(type(screen)):
        if binding.key in covered or (binding.key, binding.action) in global_keys:
            continue
        if binding.description and binding.description not in seen:
            seen.add(binding.description)
            rows.append((key_label(screen, binding), binding.description))
    return rows


class HelpScreen(ModalScreen):
    BINDINGS = [
        Binding("question_mark", "close", "close", key_display="?"),
        Binding("escape", "close", "close"),
    ]

    # The help names the screen as the flow line does (not its internal mode).
    SCREEN_NAMES = {"detail": "Finding detail"}

    def __init__(self, title: str = "⌨ Keyboard", rows: Sequence[Row] = ()) -> None:
        super().__init__()
        self._title = title
        self._rows = list(rows)

    @classmethod
    def for_screen(cls, screen: Screen) -> "HelpScreen":
        flow = getattr(screen, "flow_name", "")
        name = cls.SCREEN_NAMES.get(flow, flow.capitalize())
        return cls(f"⌨ Shortcuts · {name}" if name else "⌨ Keyboard", context_rows(screen))

    def compose(self) -> ComposeResult:
        with VerticalScroll(id="help-box") as box:   # scrolls if the terminal is short
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

    def on_mount(self) -> None:
        box = self.query_one("#help-box", VerticalScroll)
        box.focus()                         # ↑/↓ and PgUp/PgDn scroll it
        self.watch(box, "scroll_y", lambda _old, _new: self._scroll_hint(), init=False)
        self.call_after_refresh(self._scroll_hint)

    def on_resize(self) -> None:
        self.call_after_refresh(self._scroll_hint)

    def _scroll_hint(self) -> None:
        """Say so on the border while rows are hidden (a short terminal, 80×24): "↓ more"
        until the end is in view, "↑ more" once scrolled down, nothing when all of it fits."""
        box = self.query_one("#help-box", VerticalScroll)
        below = box.scroll_y < box.max_scroll_y
        above = box.scroll_y > 0
        if below:
            hint = "↓ more · ↑/↓ PgUp/PgDn scroll"
        elif above:
            hint = "↑ more above · ↑/PgUp scroll"
        else:
            hint = ""
        box.border_subtitle = hint

    @staticmethod
    def _row(keys: str, desc: str) -> Horizontal:
        """Keys in their own column; a long description wraps under itself, not the keys."""
        return Horizontal(
            Static(Text(keys, style=f"bold {theme.CYAN}"), classes="help-keys"),
            Static(Text(desc, style=theme.MUTED), classes="help-desc"),
            classes="help-row")

    def action_close(self) -> None:
        self.app.pop_screen()
