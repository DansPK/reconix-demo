"""Chat-style lines shared by the flow screens."""

from rich.text import Text
from textual.widgets import Static

from .. import theme


class UserMessage(Static):
    """The operator's sent request, echoed as `› text` on a highlighted bar (like Claude Code).

    Built as Rich Text, so typed brackets like `[TARGET]` are shown, never parsed as markup.
    """

    def __init__(self, text: str) -> None:
        super().__init__(Text.assemble(("›", theme.MUTED), " ", text), classes="user-msg")
