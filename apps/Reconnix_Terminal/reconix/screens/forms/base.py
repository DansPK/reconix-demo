"""FormScreen — a pop-up with labeled inputs, an error line, and Submit / Cancel.

Styled like `ChoiceScreen` (the `.dialog` box with a chip). A subclass lists its fields and
implements `submit(values)`, which calls the store and returns the result to dismiss with;
a `StoreValidationError` it raises is shown under the fields and the form stays open.

Work too slow for the UI thread (reading a long PDF) goes to a worker: `submit()` starts it
and returns `PENDING`, and the form stays open and busy (fields and Submit disabled,
`busy_note()` under the fields) until the worker's result reaches `finish(result)`, which
closes it, or `fail(message)`, which shows the error and lets the operator try again. Esc
still closes it.
"""

from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.screen import ModalScreen
from textual.widgets import Button, Input, Label, Static

from ... import store, theme
from ...widgets import SecretInput


PENDING = "__pending__"          # submit() started a worker; finish() / fail() come later


@dataclass(frozen=True)
class FormField:
    id: str
    label: str
    value: str = ""
    placeholder: str = ""
    secret: bool = False        # masked, kept out of the clipboard
    numeric: bool = False       # digits only (a one-time code)
    max_length: int = 0
    warn: bool = False          # label in amber (e.g. "used once, not stored")


class FormScreen(ModalScreen[Optional[str]]):
    """Dismisses with what `submit()` returns, or None on Esc / Cancel."""

    TITLE = "FORM"
    CHIP = "Form"
    SUBMIT = "Save"
    DANGER = False

    BINDINGS = [Binding("escape", "cancel", "cancel")]

    # --- what a form provides ----------------------------------------------------------------
    def fields(self) -> List[FormField]:  # pragma: no cover - overridden
        return []

    def note(self) -> Optional[Text]:
        return None

    def footer(self) -> str:
        """A short line under the buttons (plain text)."""
        return "Enter for the next field, then to submit · Esc to cancel"

    def submit(self, values: Dict[str, str]) -> Optional[str]:  # pragma: no cover
        """Apply the values through the store; raise StoreValidationError to stay open."""
        raise NotImplementedError

    def on_close(self) -> None:
        """Called before the form closes either way (forms with secrets clear them)."""

    def busy_note(self) -> str:
        """The note shown while a `PENDING` submit runs (plain text)."""
        return "Working…"

    # --- layout ----------------------------------------------------------------------------
    def compose(self) -> ComposeResult:
        with Vertical(classes="dialog form danger" if self.DANGER else "dialog form") as box:
            box.border_title = self.TITLE
            yield Static(Text(f"☐ {self.CHIP}"), classes="chip")
            note = self.note()
            if note is not None:
                yield Static(note, classes="form-note")
            for field in self.fields():
                yield Label(Text(field.label), classes="field-label -warn" if field.warn
                            else "field-label")
                yield self._input(field)
            yield Static("", id="form-error")
            with Horizontal(classes="form-actions"):
                yield Button(self.SUBMIT, id="submit", classes="primary")
                yield Button("Cancel", id="cancel", classes="ghost-cyan")
            yield Static(Text(self.footer(), style=theme.DIM), classes="menu-hint")

    @staticmethod
    def _input(field: FormField) -> Input:
        options = dict(id=field.id, value=field.value, placeholder=field.placeholder)
        if field.max_length:
            options["max_length"] = field.max_length
        if field.secret:
            return SecretInput(**options)
        if field.numeric:
            return Input(type="integer", **options)
        return Input(**options)

    def on_mount(self) -> None:
        inputs = self.query(Input)
        if inputs:
            inputs.first().focus()

    # --- behaviour --------------------------------------------------------------------------
    def _inputs(self) -> Iterable[Input]:
        return self.query(Input)

    def values(self) -> Dict[str, str]:
        return {widget.id: widget.value for widget in self._inputs() if widget.id}

    def show_error(self, message: str) -> None:
        self.query_one("#form-error", Static).update(Text(message, style=theme.CRITICAL))

    def _submit(self) -> None:
        if self.is_busy:
            return
        try:
            result = self.submit(self.values())
        except store.StoreValidationError as exc:
            self.show_error(str(exc))
            return
        if result == PENDING:
            self._set_busy(True)
            return
        self._close(result)

    # --- a submit running in a worker -------------------------------------------------------
    @property
    def is_busy(self) -> bool:
        return getattr(self, "_busy", False)

    def _set_busy(self, busy: bool) -> None:
        self._busy = busy
        for widget in self._inputs():
            widget.disabled = busy
        self.query_one("#submit", Button).disabled = busy
        note = Text(self.busy_note(), style=theme.MUTED) if busy else ""
        self.query_one("#form-error", Static).update(note)

    def finish(self, result: Optional[str]) -> None:
        """The worker succeeded: close with `result`."""
        self._set_busy(False)
        self._close(result)

    def fail(self, message: str) -> None:
        """The worker was refused: show why and let the operator edit and submit again."""
        self._set_busy(False)
        self.show_error(message)
        inputs = list(self._inputs())
        if inputs:
            inputs[0].focus()

    def _close(self, result: Optional[str]) -> None:
        self.on_close()
        self.dismiss(result)

    def on_input_submitted(self, event: Input.Submitted) -> None:
        event.stop()
        inputs = list(self._inputs())
        index = inputs.index(event.input)
        if index + 1 < len(inputs):
            inputs[index + 1].focus()
        else:
            self._submit()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        event.stop()
        if event.button.id == "submit":
            self._submit()
        else:
            self._close(None)

    def action_cancel(self) -> None:
        self._close(None)
