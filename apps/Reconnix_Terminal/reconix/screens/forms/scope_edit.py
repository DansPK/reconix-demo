"""EDIT SCOPE — change the drafted manifest before it is approved.

The limits are edited as comma-separated lists and a number; the target itself is fixed
for the assessment. The store validates every field and the policy engine then enforces
exactly what was approved.
"""

from typing import Dict, List, Optional

from rich.text import Text

from ... import store, theme
from .base import FormField, FormScreen


def _csv(values: List) -> str:
    return ", ".join(str(v) for v in values)


def _split(text: str) -> List[str]:
    return [part.strip() for part in text.split(",") if part.strip()]


class ScopeEditForm(FormScreen):
    """Dismisses with "edited" once the manifest is updated, or None."""

    TITLE = "⛉ EDIT SCOPE MANIFEST"
    CHIP = "Scope"
    SUBMIT = "Save scope"

    def __init__(self) -> None:
        super().__init__()
        self._scope = store.get_scope()
        self._network = self._scope.kind == "network"

    def fields(self) -> List[FormField]:
        scope = self._scope
        fields = [
            FormField("methods", "Allowed methods", _csv(scope.allowed_methods)),
            FormField("excluded", "Excluded paths", _csv(scope.excluded_paths),
                      placeholder="none"),
        ]
        if self._network:
            fields.append(FormField("ports", "Allowed ports", _csv(scope.allowed_ports)))
        fields += [
            FormField("tools", "Tools", _csv(scope.tools)),
            FormField("time-limit", "Time limit (minutes)", str(scope.time_limit_minutes)),
        ]
        return fields

    def note(self) -> Optional[Text]:
        return Text(f"Target {self._scope.target_url} is fixed for this assessment. Edit the "
                    "limits below; commas separate list items.", style=theme.MUTED)

    def footer(self) -> str:
        return "Saved changes go back to the manifest for approval · Esc to cancel"

    def submit(self, values: Dict[str, str]) -> Optional[str]:
        changes = dict(
            allowed_methods=_split(values["methods"]),
            excluded_paths=_split(values["excluded"]),
            tools=_split(values["tools"]),
            time_limit_minutes=values["time-limit"].strip(),
        )
        if self._network:
            changes["allowed_ports"] = _split(values["ports"])
        store.edit_scope(**changes)
        return "edited"
