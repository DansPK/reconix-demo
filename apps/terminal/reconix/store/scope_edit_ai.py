"""A line typed on "Type something." at the Scope or Plan step: recording and applying it.

The line is read locally (`edit_interpreter`). A scope change goes only through the store's
own validation (`scope_edits`, then `edit_scope`), all or nothing, and the scope is never
approved here: the operator still presses Approve. An approved scope (the Plan step) is
re-opened first. Every reply is kept in the chat history.
"""

from typing import List

from ..models import EditIntent, ScopeChanges
from .assessment import shown_line
from .edit_interpreter import ask_edit_intent
from .errors import StoreValidationError
from .redact import redact
from .scope import edit_scope, get_scope, reopen_scope, scope_changeable, scope_edits
from .transcript import add_chat

# The app's flow screen -> the step the line is read for.
EDIT_STEPS = {"template": "SCOPE", "plan": "PLAN"}


def record_answer(intent: EditIntent) -> str:
    """The reply to a question (recorded)."""
    text = redact(intent.answer)
    add_chat("text", "reconix", text)
    return text


def record_note(text: str) -> str:
    """Reconix's own line in the exchange (recorded)."""
    add_chat("text", "reconix", text, tone="muted")
    return text


def record_refusal(reason: object) -> str:
    """The store refused the change: one warning line, nothing changed."""
    reason = redact(str(reason)).strip().rstrip(".")
    text = f"The change was refused: {reason}. Nothing changed."
    add_chat("text", "reconix", text, tone="warn")
    return text


def apply_scope_changes(changes: ScopeChanges) -> List[str]:
    """Apply a scope change, validated field by field, all or nothing. Returns what changed as
    short lines ("+ port 8443", "− nikto") and records a reply listing them. An approved scope
    is re-opened first (it then needs approving again). Raises StoreValidationError, with
    nothing changed, on any bad field or no change at all."""
    scope = get_scope()
    if scope is None:
        raise StoreValidationError("There is no scope to change yet.")
    if not scope_changeable():
        raise StoreValidationError("The scope can't change now; the run is past that point.")
    fields = _fields(scope, changes)
    lines = _change_lines(scope, scope_edits(scope, **fields))   # validated; nothing changed yet
    if not lines:
        raise StoreValidationError("That is already how the scope stands.")
    if scope.status == "APPROVED":
        reopen_scope()
    edit_scope(**fields)
    add_chat("text", "reconix", "Scope changed: " + "; ".join(lines) + ". Review it and approve "
             "when ready; nothing runs before that.", tone="ok")
    return lines


def _fields(scope, changes: ScopeChanges) -> dict:
    """The edit_scope keywords for `changes` (only the fields it touches)."""
    fields: dict = {}
    if changes.target:
        fields["target"] = changes.target
    if changes.add_tools or changes.remove_tools:
        removed = {t.casefold() for t in changes.remove_tools}
        fields["tools"] = ([t for t in scope.tools if t.casefold() not in removed]
                           + list(changes.add_tools))
    if changes.add_ports or changes.remove_ports:
        if scope.kind != "network":
            raise StoreValidationError("Ports are set only on a network scope; a web or API "
                                       "scope's port is part of its target URL.")
        gone = set(changes.remove_ports)
        fields["allowed_ports"] = ([p for p in scope.allowed_ports if p not in gone]
                                   + list(changes.add_ports))
    if changes.add_excluded or changes.remove_excluded:
        back = {p.strip().casefold() for p in changes.remove_excluded}
        fields["excluded_paths"] = ([p for p in scope.excluded_paths
                                     if p.strip().casefold() not in back]
                                    + list(changes.add_excluded))
    if changes.allowed_methods is not None:
        fields["allowed_methods"] = list(changes.allowed_methods)
    if changes.time_limit_minutes is not None:
        fields["time_limit_minutes"] = changes.time_limit_minutes
    return fields


def _change_lines(scope, edits: dict) -> List[str]:
    """What `edits` would change in `scope`, one short masked line each."""
    lines: List[str] = []
    parsed = edits.get("target")
    if parsed is not None and parsed.target_url != scope.target_url:
        lines.append(f"target {shown_line(parsed.target_url)}")
    if "tools" in edits:
        lines += _diff(scope.tools, edits["tools"], "")
    if "allowed_ports" in edits:
        lines += _diff([str(p) for p in scope.allowed_ports],
                       [str(p) for p in edits["allowed_ports"]], "port ")
    if "excluded_paths" in edits:
        lines += _diff(scope.excluded_paths, edits["excluded_paths"], "excluded ")
    methods = edits.get("allowed_methods")
    if methods is not None and set(methods) != set(scope.allowed_methods):
        lines.append("methods " + ", ".join(methods))
    minutes = edits.get("time_limit_minutes")
    if minutes is not None and minutes != scope.time_limit_minutes:
        lines.append(f"time limit {minutes} min" if minutes > 0 else "no time limit")
    return lines


def _diff(before: List[str], after: List[str], label: str) -> List[str]:
    old = {v.casefold() for v in before}
    new = {v.casefold() for v in after}
    return ([f"+ {label}{shown_line(v)}" for v in after if v.casefold() not in old]
            + [f"− {label}{shown_line(v)}" for v in before if v.casefold() not in new])


__all__ = ["EDIT_STEPS", "apply_scope_changes", "ask_edit_intent", "record_answer",
           "record_note", "record_refusal"]
