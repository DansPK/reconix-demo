"""TYPE THE TARGET — an optional last step of approving a HIGH-risk action.

The store approves it only when the person types the action's exact target; the app never
fills it in. One field, empty at first. It runs after the two-step HIGH gate (the single-use
token and the command hash), never instead of it: `approve()` checks all three.
"""

from typing import Dict, List, Optional

from rich.text import Text

from ... import store, theme
from ...store.redact import redact
from .base import FormField, FormScreen


class TypedTargetForm(FormScreen):
    """Dismisses with "approved" once the store took the approval, or None."""

    TITLE = "◆ HIGH-RISK · type the target"
    CHIP = "HIGH RISK"
    SUBMIT = "Approve and run"
    DANGER = True

    def __init__(self, request_id: str, token: str) -> None:
        super().__init__()
        self._request = store.get_approval(request_id)
        self._token = token

    def fields(self) -> List[FormField]:
        return [FormField("target", "Target", "", placeholder="type it exactly as shown above",
                          max_length=2048, warn=True)]

    def note(self) -> Optional[Text]:
        req = self._request
        return Text.assemble(
            (redact(req.action), f"bold {theme.TEXT}"),
            ("  HIGH RISK", f"bold {theme.HIGH}"),
            ("\n$ ", f"bold {theme.GREEN}"),
            (redact(req.command), theme.TEXT),
            ("\nTarget  ", theme.DIM),
            (redact(req.target), f"bold {theme.TEXT}"),
            ("\nType the target to approve this step. Reconix compares it with the step's own "
             "target before anything runs.", theme.MUTED),
        )

    def footer(self) -> str:
        return "Nothing runs until the target matches · Esc to go back"

    def submit(self, values: Dict[str, str]) -> Optional[str]:
        req = self._request
        store.approve(req.request_id, command_hash=req.command_hash,
                      confirmation_token=self._token, typed_target=values["target"])
        return "approved"
