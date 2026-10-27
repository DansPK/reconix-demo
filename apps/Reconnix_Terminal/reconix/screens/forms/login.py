"""SECURE INPUT — the target login a step needs: a cookie, email + password, or a code.

The fields come from the challenge the run raised. Secret fields are masked and kept out
of the clipboard; a one-time code is validated and used once, never stored. Secrets are
wrapped in `Secret` as they leave the inputs, and every field is cleared on close.
"""

from typing import Dict, List, Optional

from rich.text import Text

from ... import store, theme
from ...models import Secret
from .base import FormField, FormScreen


class LoginForm(FormScreen):
    """Dismisses with "saved" once the store accepts the login, or None."""

    CHIP = "Target login"

    def __init__(self) -> None:
        super().__init__()
        self._challenge = store.current_auth_challenge()
        self.TITLE = self._challenge.title
        self.SUBMIT = "Submit code" if self._challenge.kind == "otp" else "Save login"

    def fields(self) -> List[FormField]:
        fields = []
        for field in self._challenge.fields:
            if field.otp:
                fields.append(FormField(field.id, field.label + "  (used once, not stored)",
                                        placeholder=field.placeholder, numeric=True,
                                        max_length=6, warn=True))
            elif field.secret:
                fields.append(FormField(field.id, field.label, placeholder=field.placeholder,
                                        secret=True, max_length=4096))
            else:
                fields.append(FormField(field.id, field.label, placeholder=field.placeholder,
                                        max_length=64))
        return fields

    def note(self) -> Optional[Text]:
        where = Text(f"Scope: {store.get_assessment().target} only.", style=theme.DIM)
        return Text.assemble((self._challenge.note, theme.MUTED), "\n", where)

    def submit(self, values: Dict[str, str]) -> Optional[str]:
        secret_ids = {f.id for f in self._challenge.fields if f.secret}
        wrapped = {key: Secret(value) if key in secret_ids else value
                   for key, value in values.items()}
        try:
            store.provide_auth(wrapped)
        except store.StoreValidationError:
            raise
        except Exception:   # e.g. a backend outage: never let it surface with the secret
            self._clear()
            raise store.StoreValidationError("Couldn't save the login. Try again.") from None
        return "saved"

    def _clear(self) -> None:
        for widget in self._inputs():
            widget.value = ""

    def on_close(self) -> None:
        self._clear()
