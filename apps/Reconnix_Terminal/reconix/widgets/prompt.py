"""The Claude-Code-style prompt: slash-command suggestions, history, and a hint line."""

from typing import Callable, List, Optional, Sequence

from textual import events
from textual.actions import SkipAction
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.message import Message
from textual.widgets import Input, Static

from .. import theme
from ..commands.registry import Command, find, match
from ..models import Choice
from .choice_menu import ChoiceMenu, SuggestionMenu
from .history import PromptHistory


class PromptInput(Input):
    """An Input that offers ↑/↓, Tab, Esc and Ctrl+R to its PromptBox before the screen does."""

    BINDINGS = [
        Binding("up", "prompt('up')", "previous", show=False),
        Binding("down", "prompt('down')", "next", show=False),
        Binding("tab", "prompt('tab')", "complete", show=False),
        Binding("escape", "prompt('escape')", "close / clear", show=False),
        Binding("ctrl+r", "prompt('search')", "search history", show=False),
    ]

    def __init__(self, box: "PromptBox", **kwargs) -> None:
        super().__init__(select_on_focus=False, **kwargs)
        self._box = box

    def action_prompt(self, key: str) -> None:
        if not self._box.handle_prompt_key(key):
            raise SkipAction()   # let Tab move focus / Esc reach the screen

    def _on_key(self, event: events.Key) -> None:
        # Runs before Input._on_key: "?" on an empty prompt opens help instead of typing.
        if event.character == "?" and not self.value:
            event.stop()
            event.prevent_default()
            self.app.action_help()


class PromptBox(Vertical):
    """Prompt input + slash-command suggestions + a contextual hint line.

    Posts `Submitted` for plain text and `CommandSubmitted` for `/command` lines.
    The host acts on them and calls `clear()` when they succeed. The box never
    writes to the store itself.
    """

    class Submitted(Message):
        def __init__(self, box: "PromptBox", text: str) -> None:
            super().__init__()
            self.box = box
            self.text = text

    class CommandSubmitted(Message):
        def __init__(self, box: "PromptBox", text: str) -> None:
            super().__init__()
            self.box = box
            self.text = text

    def __init__(
        self, commands: Sequence[Command], history: Callable[[], List[str]], *,
        placeholder: str = "", initial: str = "", escape_clears: bool = True,
        id: Optional[str] = None,
    ) -> None:
        super().__init__(id=id)
        self._commands = tuple(commands)
        self._history_provider = history
        self._history = PromptHistory(history)
        self._placeholder = placeholder
        self._initial = initial
        self._escape_clears = escape_clears   # False: Esc falls through (the bar closes)
        self._mode = ""                       # "" | "command" | "arg" | "history"
        self._matches: List[Command] = []     # command mode
        self._arg_command: Optional[Command] = None   # arg mode
        self._history_matches: List[str] = []         # history-search mode
        self._history_draft = ""              # input text saved while searching

    def compose(self) -> ComposeResult:
        # The menu is a CSS overlay drawn just above the input, so opening it
        # never moves the input or the content around it.
        yield SuggestionMenu(id="suggestions")
        yield PromptInput(self, value=self._initial, placeholder=self._placeholder, id="prompt")
        yield Static(id="prompt-hint", markup=True)

    def on_mount(self) -> None:
        self.input.cursor_position = len(self.input.value)
        self._refresh(self.input.value)

    # --- parts ----------------------------------------------------------------------
    @property
    def input(self) -> PromptInput:
        return self.query_one(PromptInput)

    @property
    def menu(self) -> SuggestionMenu:
        return self.query_one(SuggestionMenu)

    @property
    def menu_open(self) -> bool:
        return bool(self.menu.display)

    def focus_input(self) -> None:
        self.input.focus()

    @property
    def locked(self) -> bool:
        return self.input.disabled

    def set_locked(self, locked: bool) -> None:
        """Lock the input while Reconix works (the host shows the spinner), or unlock it."""
        if not locked:
            self.input.disabled = False
            self.input.focus()
            self._update_hint()
            return
        self.menu.display = False
        self.input.disabled = True
        self.query_one("#prompt-hint", Static).update("")   # input keys don't work while locked

    def clear(self) -> None:
        self._history.reset()
        self._mode = ""
        self._set_text("")

    # --- typing -----------------------------------------------------------------------
    def on_input_changed(self, event: Input.Changed) -> None:
        event.stop()
        if self._mode == "history":
            self._refresh_history(event.value)
            return
        self._history.reset()
        self._refresh(event.value)

    def _refresh(self, text: str) -> None:
        """Show the commands matching `/name`, or the argument choices for `/name <arg>`."""
        self._mode = ""
        self._matches = []
        self._arg_command = None
        choices: List[Choice] = []
        if text.startswith("/"):
            name, sep, rest = text[1:].partition(" ")
            if not sep:                                   # still typing the command name
                self._matches = match(self._commands, name)
                if self._matches:
                    self._mode = "command"
                    width = max(len(c.name) for c in self._matches) + 3
                    choices = [Choice(c.name, f"/{c.name}".ljust(width), c.description)
                               for c in self._matches]
            else:                                         # typing an argument
                command = find(self._commands, name)
                if command is not None and command.choices is not None:
                    self._arg_command = command
                    query = rest.strip().lower()
                    options = command.choices(self.app)
                    matches = [c for c in options
                               if not query or query in c.id.lower() or query in c.label.lower()]
                    if matches:
                        self._mode = "arg"
                        width = max(len(c.label) for c in matches) + 3
                        choices = [Choice(c.id, c.label.ljust(width), c.hint) for c in matches]
        if choices:
            self.menu.set_choices(choices)
        self.menu.display = bool(choices)
        self._update_hint()

    def _refresh_history(self, query: str) -> None:
        """Ctrl+R mode: show recent prompts (newest first) that contain `query`."""
        q = query.strip().lower()
        seen: List[str] = []
        for text in reversed(self._history_provider()):
            if text in seen or (q and q not in text.lower()):
                continue
            seen.append(text)
        self._history_matches = seen[:20]
        if self._history_matches:
            self.menu.set_choices(
                [Choice(str(i), text) for i, text in enumerate(self._history_matches)]
            )
        self.menu.display = bool(self._history_matches)
        self._update_hint()

    def _set_text(self, text: str) -> None:
        """Replace the text without reopening the menu (history recall, completion)."""
        inp = self.input
        with inp.prevent(Input.Changed):
            inp.value = text
        inp.cursor_position = len(text)
        self.menu.display = False
        self._update_hint()

    def _update_hint(self) -> None:
        esc = "esc clear" if self._escape_clears else "esc close"
        if self._mode == "history":
            hint = "type to search history · ↑↓ pick · ↵ insert · esc cancel"
        elif self.menu_open:
            hint = "↑↓ navigate · tab complete · ↵ run · esc close"
        elif self._history.browsing:
            hint = f"↑↓ history · ↵ send · {esc}"
        elif self.input.value:
            hint = f"↵ send · {esc}"
        else:
            hint = "/ for commands · ↑ history · ^R search · ? for shortcuts"
        self.query_one("#prompt-hint", Static).update(f"[{theme.DIM}]{hint}[/]")

    # --- keys forwarded by PromptInput (False = let the key fall through) -------------
    def handle_prompt_key(self, key: str) -> bool:
        if key == "search":                       # Ctrl+R: start / cancel history search
            if self._mode == "history":
                self._exit_history(restore=True)
            else:
                self._enter_history()
            return True
        if key in ("up", "down"):
            if self.menu_open:
                self.menu.action_cursor_up() if key == "up" else self.menu.action_cursor_down()
            elif self._mode != "history":
                text = (self._history.older(self.input.value) if key == "up"
                        else self._history.newer())
                if text is not None:
                    self._set_text(text)
            return True
        if key == "tab":
            if not self.menu_open or self._mode == "history":
                return False
            self._complete()
            return True
        if key == "escape":
            if self._mode == "history":
                self._exit_history(restore=True)
                return True
            if self._escape_clears:
                if self.menu_open:
                    self.menu.display = False
                    self._update_hint()
                    return True
                if self.input.value:
                    self.clear()
                    return True
        return False

    def _highlighted_command(self) -> Optional[Command]:
        name = self.menu.highlighted_id
        return next((c for c in self._matches if c.name == name), None)

    def _complete(self) -> None:
        if self._mode == "command":
            command = self._highlighted_command()
            if command is not None:
                self._set_text(f"/{command.name}" + (" " if command.takes_argument else ""))
        elif self._mode == "arg" and self._arg_command is not None:
            choice_id = self.menu.highlighted_id
            if choice_id is not None:
                self._set_text(f"/{self._arg_command.name} {choice_id}")

    # --- history search (Ctrl+R) ------------------------------------------------------
    def _enter_history(self) -> None:
        self._history.reset()
        self._history_draft = self.input.value
        self._mode = "history"
        with self.input.prevent(Input.Changed):
            self.input.value = ""
        self.input.cursor_position = 0
        self._refresh_history("")

    def _exit_history(self, restore: bool) -> None:
        self._mode = ""
        self.menu.display = False
        self._set_text(self._history_draft if restore else self.input.value)

    def _accept_history(self) -> None:
        choice_id = self.menu.highlighted_id
        if choice_id is not None and self._history_matches:
            self._history_draft = self._history_matches[int(choice_id)]
        self._exit_history(restore=True)

    # --- submitting -------------------------------------------------------------------
    def on_input_submitted(self, event: Input.Submitted) -> None:
        event.stop()
        if self._mode == "history":
            self._accept_history()           # Enter inserts the match; it is not run
            return
        text = self._submission_text(event.value)
        if text.startswith("/"):
            self.post_message(self.CommandSubmitted(self, text))
        else:
            self.post_message(self.Submitted(self, text))

    def _submission_text(self, value: str) -> str:
        if self.menu_open and self._mode == "command":
            command = self._highlighted_command()
            if command is not None:
                return f"/{command.name}"
        elif self.menu_open and self._mode == "arg" and self._arg_command is not None:
            choice_id = self.menu.highlighted_id
            if choice_id is not None:
                return f"/{self._arg_command.name} {choice_id}"
        return value.strip()

    def on_choice_menu_chosen(self, event: ChoiceMenu.Chosen) -> None:
        # A mouse click on a suggestion runs it, like Enter.
        event.stop()
        if self._mode == "arg" and self._arg_command is not None:
            self.post_message(
                self.CommandSubmitted(self, f"/{self._arg_command.name} {event.choice_id}")
            )
        else:
            self.post_message(self.CommandSubmitted(self, f"/{event.choice_id}"))
