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
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.screen import ModalScreen
from textual.widgets import Button, Input, Label, Static

from ... import store, theme
from ...widgets import SecretInput


PENDING = "__pending__"          # submit() started a worker; finish() / fail() come later


class FormBody(VerticalScroll):
    """The form's scrolling fields. Its size is only known after layout, so it tells the
    form when it changes (the form then keeps the focused field in view, see `_after_fit`)."""

    def on_resize(self) -> None:
        after_fit = getattr(self.screen, "_after_fit", None)
        if after_fit is not None:
            self.call_after_refresh(after_fit)


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

    BINDINGS = [
        Binding("escape", "cancel", "cancel"),
        Binding("pageup", "scroll_body(-1)", "scroll up", show=False),
        Binding("pagedown", "scroll_body(1)", "scroll down", show=False),
    ]

    # --- what a form provides ----------------------------------------------------------------
    def fields(self) -> List[FormField]:  # pragma: no cover - overridden
        return []

    def note(self) -> Optional[Text]:
        return None

    def footer(self) -> str:
        """A short line under the buttons (plain text)."""
        return "Enter: next field, then submit · Ctrl+U clears a field · Esc cancels"

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
            # The fields scroll; the error line, Save / Cancel and the hint stay pinned below,
            # so a form taller than the terminal never hides its buttons (80×24).
            with FormBody(classes="form-body"):
                yield Static(Text(f"☐ {self.CHIP}"), classes="chip")
                note = self.note()
                if note is not None:
                    yield Static(note, classes="form-note")
                for field in self.fields():
                    yield Label(Text(field.label), classes="field-label -warn" if field.warn
                                else "field-label")
                    yield self._input(field)
            yield Static(Text("↓ more fields below (Tab, ↓ or PgDn)", style=theme.MEDIUM),
                         id="form-more")
            error = Static("", id="form-error")
            error.display = False                  # no empty row until there is something to say
            yield error
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
        for body in self.query(".form-body"):
            self.watch(body, "scroll_y", lambda _value: self._show_more_hint(), init=False)
        self.call_after_refresh(self._fit_body)

    def on_descendant_focus(self) -> None:
        self.call_after_refresh(self._show_more_hint)

    def on_resize(self) -> None:
        self.call_after_refresh(self._fit_body)

    def _fit_body(self) -> None:
        """Give the fields what the screen has left once the pinned rows (error line, buttons,
        hint) and the box's border fit, so those rows always stay on screen.

        `.dialog` may take 90% of the screen; a short form keeps its natural height."""
        dialogs = self.query(".dialog")
        bodies = self.query(".form-body")
        if not dialogs or not bodies:
            return
        dialog, body = dialogs.first(), bodies.first()
        pinned = sum(child.outer_size.height + child.styles.margin.top
                     + child.styles.margin.bottom
                     for child in dialog.children if child is not body)
        room = int(self.size.height * 0.9) - dialog.styles.gutter.height - pinned
        body.styles.max_height = max(3, room)
        self.call_after_refresh(self._after_fit)   # again once the body has its new size

    def _after_fit(self) -> None:
        """Once the fields' room is laid out: bring the field in focus into view (PROV-02: at
        80×24 the first field was focused before the body shrank, and stayed below it), and
        say when more fields wait below the fold."""
        bodies = self.query(".form-body")
        if not bodies:
            return
        body = bodies.first()
        focused = self.focused
        if focused is not None and body in focused.ancestors:
            body.scroll_to_widget(focused, animate=False)
        self._show_more_hint()

    def _show_more_hint(self) -> None:
        """"↓ more fields" under the fields while some are below the fold (hidden otherwise)."""
        bodies, hints = self.query(".form-body"), self.query("#form-more")
        if not bodies or not hints:
            return
        body, hint = bodies.first(), hints.first(Static)
        below = body.max_scroll_y > 0 and body.scroll_y < body.max_scroll_y
        hint.display = below

    def action_scroll_body(self, direction: int) -> None:
        for body in self.query(".form-body"):
            if direction > 0:
                body.scroll_page_down(animate=False)
            else:
                body.scroll_page_up(animate=False)

    # --- behaviour --------------------------------------------------------------------------
    def _inputs(self) -> Iterable[Input]:
        return self.query(Input)

    def values(self) -> Dict[str, str]:
        return {widget.id: widget.value for widget in self._inputs() if widget.id}

    def show_error(self, message: str) -> None:
        self._set_note(Text(message, style=theme.CRITICAL))

    def _set_note(self, note: Text) -> None:
        """The line under the fields (an error, or the busy note); hidden while empty."""
        line = self.query_one("#form-error", Static)
        line.update(note)
        line.display = bool(note.plain)
        self.call_after_refresh(self._fit_body)      # a long error takes rows from the fields

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
        self._set_note(Text(self.busy_note(), style=theme.MUTED) if busy else Text(""))

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
