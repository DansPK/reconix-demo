"""Claude-Code-style selection menus: ↑/↓ or a number to pick, Enter to choose."""

from typing import Any, List, Optional, Sequence, Tuple

from rich.text import Text
from textual import events
from textual.binding import Binding
from textual.message import Message
from textual.widgets import OptionList
from textual.widgets.option_list import Option

from .. import theme
from ..models import Choice

POINTER = "❯"


def menu_hint(esc: str = "cancel", *extra: str) -> str:
    """The key hint under a question, e.g. "Enter to select · ↑/↓ to navigate · Esc to cancel"."""
    parts = ("Enter to select", "↑/↓ to navigate") + extra + (f"Esc to {esc}",)
    return f"[{theme.DIM}]{' · '.join(parts)}[/]"


class ChoiceMenu(OptionList):
    """A list of Choices drawn like Claude Code's questions.

        ❯ 1. Approve (Recommended)
             Accept the change and continue.
          2. Reject
          3. Type something.
        ─────────────────────
          4. Chat about this

    Posts `Chosen` when a choice is picked and `Typed` when free text is sent from
    an input row. Prompts are Rich Text, so labels are never parsed as markup.
    """

    COMPACT = False                 # one line per choice (used by the slash menu)
    NUMBERED = True                 # show numbers and let 1-9 pick
    ACTIVE_WITHOUT_FOCUS = False    # bright pointer even without focus (slash menu)

    BINDINGS = [Binding(str(n), f"pick({n})", show=False) for n in range(1, 10)]

    class Chosen(Message):
        def __init__(self, menu: "ChoiceMenu", choice_id: str) -> None:
            super().__init__()
            self.menu = menu
            self.choice_id = choice_id

        @property
        def control(self) -> "ChoiceMenu":
            return self.menu

    class Typed(Message):
        def __init__(self, menu: "ChoiceMenu", text: str) -> None:
            super().__init__()
            self.menu = menu
            self.text = text

        @property
        def control(self) -> "ChoiceMenu":
            return self.menu

    def __init__(
        self, choices: Sequence[Choice] = (), *, default: int = 0,
        numbered: Optional[bool] = None,
        id: Optional[str] = None, classes: Optional[str] = None,
    ) -> None:
        self._choices: List[Choice] = list(choices)
        self._default = default
        self._numbered = self.NUMBERED if numbered is None else numbered
        self._pointer: Optional[int] = None
        self._draft = ""                # text typed into the input row
        super().__init__(*self._build_options(), id=id, classes=classes)

    # --- public API -----------------------------------------------------------------
    def set_choices(self, choices: Sequence[Choice]) -> None:
        self._choices = list(choices)
        self._pointer = None
        self._draft = ""
        self.set_options(self._build_options())   # resets `highlighted` to None
        first = self._first_enabled(0)
        if first is not None:
            self.highlighted = first
            self._move_pointer(first)

    @property
    def highlighted_id(self) -> Optional[str]:
        choice = self._highlighted_choice()
        return choice.id if choice else None

    def choose_highlighted(self) -> None:
        if self.highlighted is not None:
            self._activate(self.highlighted)

    # --- picking ----------------------------------------------------------------------
    def _highlighted_choice(self) -> Optional[Choice]:
        if self.highlighted is None or not 0 <= self.highlighted < len(self._choices):
            return None
        return self._choices[self.highlighted]

    def _first_enabled(self, start: int) -> Optional[int]:
        """The first choice at or after `start` (wrapping) that can be picked."""
        count = len(self._choices)
        for offset in range(count):
            index = (start + offset) % count
            if not self._choices[index].disabled:
                return index
        return None

    def _activate(self, index: int) -> None:
        choice = self._choices[index]
        if choice.disabled:          # also guards the screen's Enter fallback
            return
        if choice.kind != "input":
            self.post_message(self.Chosen(self, choice.id))
            return
        text = self._draft.strip()
        if text:
            self._draft = ""
            self._move_pointer(index)
            self.post_message(self.Typed(self, text))

    def check_action(self, action: str, parameters: Tuple[Any, ...]) -> Optional[bool]:
        if action == "pick":
            return self._numbered   # unnumbered menus leave digits alone
        return True

    def action_pick(self, number: int) -> None:
        index = number - 1
        if not 0 <= index < len(self._choices):
            return
        if self._choices[index].disabled:
            self.app.bell()
            return
        self.highlighted = index
        if self._choices[index].kind != "input":   # the input row just takes the cursor
            self._activate(index)

    # --- rendering --------------------------------------------------------------------
    def _build_options(self) -> List[Optional[Option]]:
        options: List[Optional[Option]] = []
        for i, choice in enumerate(self._choices):
            if choice.separated and options:
                options.append(None)   # OptionList draws a rule under the previous option
            options.append(Option(self._render_choice(i, choice, i == self._pointer),
                                  id=choice.id, disabled=choice.disabled))
        return options

    def _render_choice(self, index: int, choice: Choice, highlighted: bool) -> Text:
        active = highlighted and (self.has_focus or self.ACTIVE_WITHOUT_FOCUS)
        accent = theme.CRITICAL if choice.tone == "danger" else theme.CYAN
        line = Text()
        line.append(f"{POINTER} " if highlighted else "  ",
                    style=f"bold {theme.CYAN if active else theme.DIM}")
        if self.COMPACT:
            line.append(choice.label, style=f"bold {accent}" if highlighted else theme.TEXT)
            if choice.hint:
                line.append(f"  {choice.hint}", style=theme.DIM)
            return line
        number = f"{index + 1}. " if self._numbered else ""
        if choice.disabled:                         # dead end: visible but not pickable
            line.append(number + choice.label, style=theme.DIM)
            line.append("  (not in demo)", style=f"italic {theme.DIM}")
            return line
        line.append(number, style=accent if highlighted else theme.DIM)
        if choice.kind == "input":
            if self._draft:
                line.append(self._draft, style=theme.TEXT)
            else:
                line.append(choice.label, style=theme.MUTED)
            if active:
                line.append("▏", style=theme.CYAN)
            return line
        label = choice.label + (" (Recommended)" if choice.recommended else "")
        if highlighted:
            line.append(label, style=f"bold {accent}")
        else:
            line.append(label, style=theme.CRITICAL if choice.tone == "danger" else theme.TEXT)
        if choice.tag:
            line.append("  ")
            line.append_text(theme.chip(choice.tag, "cyan"))
        if choice.hint:
            line.append("\n" + " " * (2 + len(number)) + choice.hint, style=theme.MUTED)
        return line

    def _move_pointer(self, index: Optional[int]) -> None:
        old, self._pointer = self._pointer, index
        for i in {old, index}:
            if i is not None and 0 <= i < len(self._choices):
                self.replace_option_prompt_at_index(
                    i, self._render_choice(i, self._choices[i], i == index),
                )

    # --- events -----------------------------------------------------------------------
    def on_mount(self) -> None:
        if self._choices:
            first = self._first_enabled(min(self._default, len(self._choices) - 1))
            if first is not None:
                self.highlighted = first
                self._move_pointer(first)

    def on_focus(self) -> None:
        # Redraw after the base Widget handler has updated `has_focus`.
        self.call_later(self._move_pointer, self.highlighted)

    def on_blur(self) -> None:
        self.call_later(self._move_pointer, self.highlighted)

    def _on_key(self, event: events.Key) -> None:
        # On the input row, keys type text instead of reaching menu or screen shortcuts.
        choice = self._highlighted_choice()
        if choice is None or choice.kind != "input":
            return
        if event.is_printable and event.character:
            self._draft += event.character
        elif event.key == "backspace" and self._draft:
            self._draft = self._draft[:-1]
        elif event.key == "escape" and self._draft:
            self._draft = ""
        else:
            return
        event.stop()
        event.prevent_default()
        self._move_pointer(self.highlighted)

    def _on_option_list_option_highlighted(self, event: OptionList.OptionHighlighted) -> None:
        event.stop()
        self._move_pointer(event.option_index)

    def _on_option_list_option_selected(self, event: OptionList.OptionSelected) -> None:
        event.stop()   # screens listen for Chosen / Typed, never the raw OptionList message
        self._activate(event.option_index)


class SuggestionMenu(ChoiceMenu, can_focus=False):
    """A one-line-per-choice menu that never takes focus; the prompt's Input drives it."""

    COMPACT = True
    NUMBERED = False
    ACTIVE_WITHOUT_FOCUS = True
