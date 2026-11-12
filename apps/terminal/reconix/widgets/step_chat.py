"""The chat inside a step: replaces the step's menu while you talk, Esc brings it back.

Opened by "Type something." or "Chat about this" on the Template/Scope, Plan and Approval
screens. It shows your lines and Reconix's replies (`◆ reconix`, the built-in answers of
`store/replies.py`); its input (`ChatBar`) is pinned at the bottom. The screen answers
each line (`Asked`) and closes the chat on `Closed`. Every line is built as Rich Text, so
typed brackets are shown, never parsed as markup.
"""

from rich.text import Text
from textual.app import ComposeResult
from textual.actions import SkipAction
from textual.binding import Binding
from textual.containers import Vertical
from textual.message import Message
from textual.widget import Widget
from textual.widgets import Input, Static

from .. import theme

THINKING = "thinking…"


class _ChatInput(Input):
    """The chat's input: ←/→ move the cursor in typed text; on an empty input they pass on to
    the app, which keeps the chat open and says "Esc closes the chat first."."""

    BINDINGS = [
        Binding("left", "arrow(-1)", "cursor left", show=False),
        Binding("right", "arrow(1)", "cursor right", show=False),
    ]

    def action_arrow(self, direction: int) -> None:
        """Move the cursor one place (-1 left, 1 right); with nothing typed, skip this
        binding so the app's ←/→ handler says how to leave the chat."""
        if not self.value:
            raise SkipAction()
        if direction < 0:
            self.action_cursor_left()
        else:
            self.action_cursor_right()


def you_line(text: str) -> Text:
    return Text.assemble(("you        ", f"bold {theme.TEAL}"), (text, theme.TEXT))


def speaker_label(author: str = "") -> str:
    """ "◆ reconix  " for Reconix's own lines, "◆ <model>  " for a model's (`author`)."""
    return f"◆ {author or 'reconix'}  "


def reply_line(text: str, tone: str = "default", author: str = "") -> Text:
    return Text.assemble(
        (speaker_label(author), f"bold {theme.CYAN}"), (text, theme.TONE.get(tone, theme.TEXT))
    )


class StepChat(Vertical):
    """Your lines and Reconix's replies. The input is the `ChatBar` pinned under them.

    It may also hold the step's menu or the scope card; Esc there closes the chat too."""

    BINDINGS = [Binding("escape", "close", "back to the step")]

    class Asked(Message):
        def __init__(self, chat: "StepChat", text: str) -> None:
            super().__init__()
            self.chat = chat
            self.text = text

    class Closed(Message):
        def __init__(self, chat: "StepChat") -> None:
            super().__init__()
            self.chat = chat

    def __init__(self, first: str = "", *, id: str = "step-chat") -> None:
        super().__init__(id=id, classes="step-chat")
        self._first = first

    def compose(self) -> ComposeResult:
        if self._first:
            yield Static(reply_line(self._first), classes="chat-line")

    @property
    def input(self) -> Input:
        return self.screen.query_one("#step-chat-input", Input)

    def focus_input(self) -> None:
        self.input.focus()

    def add_you(self, text: str) -> None:
        self.add(Static(you_line(text), classes="chat-line"))

    def add_reply(self, text: str, tone: str = "default", author: str = "") -> Static:
        """A Reconix line (or a model's: `author`); keep it to grow it in place
        (`show_reply`)."""
        line = Static(reply_line(text, tone, author), classes="chat-line")
        self.add(line)
        return line

    def show_reply(self, line: Static, text: str, tone: str = "default",
                   author: str = "") -> None:
        line.update(reply_line(text, tone, author))
        self.scroll_to_end()

    def add(self, widget: Widget) -> None:
        """Mount a line (or the tick list) after the others, then keep the end in view."""
        self.mount(widget)
        self.scroll_to_end()

    def action_close(self) -> None:
        self.post_message(StepChat.Closed(self))

    def scroll_to_end(self) -> None:
        parent = self.parent
        if parent is not None:
            self.call_after_refresh(parent.scroll_end, animate=False)


class ChatBar(Vertical):
    """The step chat's input, pinned at the bottom like the Start prompt. Esc closes it."""

    BINDINGS = [Binding("escape", "close", "back to the step")]

    def __init__(self, *, id: str = "step-chat-bar") -> None:
        super().__init__(id=id, classes="chat-bar")

    def compose(self) -> ComposeResult:
        # No select-all on focus: a key typed on the chat's menu arrives here first, and the
        # next key must add to it, not replace it.
        yield _ChatInput(
            placeholder="› type a question…", id="step-chat-input", select_on_focus=False
        )
        yield Static(Text("Enter ask · Esc back to the step", style=theme.DIM), classes="menu-hint")

    def on_input_submitted(self, event: Input.Submitted) -> None:
        event.stop()
        text = event.value.strip()
        if text:
            event.input.value = ""
            self.post_message(StepChat.Asked(self.screen.query_one(StepChat), text))

    def action_close(self) -> None:
        self.post_message(StepChat.Closed(self.screen.query_one(StepChat)))
