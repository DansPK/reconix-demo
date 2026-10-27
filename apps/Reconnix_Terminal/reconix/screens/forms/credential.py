"""SECURE INPUT — credentials the AI agent asks for mid-assessment.

The harness agent requests a login through its `request_credentials` tool; this modal
collects only the fields it asked for (password / token / cookie are masked) and returns
them to the agent, which performs the login host-side. The raw password is never sent to
the model and every field is cleared on close.
"""

from typing import Dict, List, Optional

from rich.text import Text

from ... import theme
from .base import FormField, FormScreen

_LABELS = {
    "login_url": "Login URL",
    "username": "Username",
    "password": "Password",
    "token": "Token (JWT / Bearer)",
    "cookie": "Cookie",
}
_SECRET = {"password", "token", "cookie"}
_ORDER = ("login_url", "username", "password", "token", "cookie")


class CredentialForm(FormScreen):
    """Dismisses with a dict of the collected values, or None if cancelled."""

    TITLE = "Secure input — credentials"
    CHIP = "Agent login"
    SUBMIT = "Provide"

    def __init__(self, request: Dict[str, object]) -> None:
        super().__init__()
        requested = [f for f in (request.get("fields") or []) if f in _LABELS] \
            or ["username", "password"]
        # Keep a stable, sensible field order.
        self._field_ids = [f for f in _ORDER if f in requested]
        self._reason = str(request.get("reason") or "Credentials needed to continue.")
        self._login_url = str(request.get("login_url") or "")

    def fields(self) -> List[FormField]:
        out: List[FormField] = []
        for fid in self._field_ids:
            value = self._login_url if fid == "login_url" else ""
            out.append(FormField(fid, _LABELS[fid], value=value,
                                  secret=fid in _SECRET, max_length=4096))
        return out

    def note(self) -> Optional[Text]:
        return Text(self._reason, style=theme.MUTED)

    def submit(self, values: Dict[str, str]) -> Dict[str, str]:
        # No store call — hand the collected values back to the agent (host-side login).
        return {fid: values.get(fid, "") for fid in self._field_ids}

    def _clear(self) -> None:
        for widget in self._inputs():
            widget.value = ""

    def on_close(self) -> None:
        self._clear()
