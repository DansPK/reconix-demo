"""EDIT PARAMS — change where a gated action runs, before it is decided.

One field: the action's path, host:port or file. The store decides (`edit_approval`): the
policy engine must allow the new value, and the exact command and its hash are rebuilt, so
the operator then approves the request as it is shown. Risk and method never change.
"""

from typing import Dict, List, Optional

from rich.text import Text

from ... import store, theme
from ...store.redact import redact
from .base import FormField, FormScreen


class ApprovalEditForm(FormScreen):
    """Dismisses with "edited" once the action is updated, or None."""

    TITLE = "✎ EDIT ACTION PARAMS"
    CHIP = "Params"
    SUBMIT = "Save params"

    def __init__(self, request_id: str) -> None:
        super().__init__()
        self._request = store.get_approval(request_id)

    def fields(self) -> List[FormField]:
        # The input keeps the real current value so the operator edits what actually runs;
        # only the note below is masked.
        req = self._request
        return [FormField("param", req.param_label, req.path, max_length=200)]

    def note(self) -> Optional[Text]:
        req = self._request
        risk = theme.RISK.get(req.risk, theme.MUTED)
        check = ("you still double-check it before it runs" if req.risk == "HIGH"
                 else "you still approve it before it runs")
        action, command = redact(req.action), redact(req.command)   # display only
        note = Text.assemble(
            (action, f"bold {theme.TEXT}"), ("  ", ""), (f"{req.risk} RISK", f"bold {risk}"),
            ("\n$ ", f"bold {theme.GREEN}"), (command, theme.TEXT),
            (f"\nChange the {req.param_label.lower()} only. The policy engine checks it; the "
             f"risk stays {req.risk} and {check}.", theme.MUTED),
        )
        if action != req.action or command != req.command:
            note.append("\nsecrets masked on screen", style=theme.DIM)
        return note

    def footer(self) -> str:
        return "The exact request is rebuilt from it · Esc to cancel"

    def submit(self, values: Dict[str, str]) -> Optional[str]:
        store.edit_approval(self._request.request_id, values["param"])
        return "edited"
