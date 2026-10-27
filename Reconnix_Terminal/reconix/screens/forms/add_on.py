"""ADD A KNOWLEDGE FILE — point the AI at a reference document (a knowledge add-on).

Reading a file (a long PDF especially) is slow, so the form never reads it itself: Add hands
the path to the app's `/add-on` worker (`add_knowledge_file`) and the form stays open, busy,
until the worker reports back: `finish("added")` closes it, `fail(message)` shows the store's
refusal under the field. Esc still closes it; the worker's outcome is then a notification.
"""

from typing import Dict, List, Optional

from rich.text import Text

from ... import theme
from .base import PENDING, FormField, FormScreen


class AddOnForm(FormScreen):
    """Dismisses with "added" once a source is saved, or None."""

    TITLE = "ADD A KNOWLEDGE FILE"
    CHIP = "Add-on"
    SUBMIT = "Add"

    def fields(self) -> List[FormField]:
        return [FormField("path", "File path", placeholder="~/docs/runbook.md")]

    def note(self) -> Optional[Text]:
        return Text(
            "Read once, passages kept on this computer (redacted), used as reference by the "
            "AI; never run. Relevant passages are sent to the active model with your "
            "questions.",
            style=theme.MUTED,
        )

    def footer(self) -> str:
        return "Supported: .txt .md .json .yaml .yml .docx .pdf · Esc to cancel"

    def busy_note(self) -> str:
        return "Reading the file…"

    def submit(self, values: Dict[str, str]) -> Optional[str]:
        self.app.add_knowledge_file(values["path"], form=self)
        return PENDING
