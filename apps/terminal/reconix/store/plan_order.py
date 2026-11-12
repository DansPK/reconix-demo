"""Changing the plan's order: what may move, and the move itself.

The phases run in a fixed order (discovery, scanning, validation, analysis, report): each
works on what the one before found, so none can move. The gated checks inside validation
(3a, 3b…) may change places with each other. Reconix only explains a reorder; the
operator orders the rows in the step chat's order list, and `reorder_gated` checks that
order and applies it: the approvals and the run's own steps move together, so the run
follows exactly the order the plan shows.
"""

import re
from typing import List, Tuple

from ..models import GATE_APPROVAL_PREFIX, GATE_PLAN, RunStep
from . import lists
from .activity import log_event
from .errors import StoreValidationError
from .transcript import add_activity, add_chat

ONLY_YOU = (
    "Only you can change the order. The phases stay in order: each works on what "
    "the one before found. The gated checks can change places: move them with "
    "Shift+↑/↓, then press Enter to save."
)
FIXED = "The plan's order can't change now: {why}."

_STEP_REF = re.compile(r"\b(?:\d{1,2}[a-z]?|steps?)\b", re.IGNORECASE)
_MOVE = re.compile(r"\b(?:move|reorder|re-order|swap|switch|put|rearrange|shift)\b", re.IGNORECASE)
_CHANGE = re.compile(r"\bchange\b", re.IGNORECASE)
_PLACE = re.compile(r"\b(?:first|last|before|after|earlier|later|top|order|start)\b", re.IGNORECASE)
_BLOCK = 4  # "Risk: …" log, the approval gate, its banner, the tool log after it


def wants_plan_reorder(text: str) -> bool:
    """ "move 3b before 3a", "can we change 3a and 3b to first": a line about the order."""
    if not _STEP_REF.search(text):
        return False
    return bool(_MOVE.search(text) or (_CHANGE.search(text) and _PLACE.search(text)))


def why_fixed() -> str:
    """Why the order can't change now ("" when it can)."""
    assessment = lists.current()
    run = assessment.run
    if run.stopped:
        return "the assessment stopped"
    if run.plan_started:
        return "the plan is already running"
    if run.waiting_gate != GATE_PLAN:
        return "approve the scope and wait for the plan first"
    if len(assessment.approvals) < 2:
        return "it has fewer than two gated checks, and the phases keep their order"
    return ""


def movable() -> List[str]:
    """The gated checks that may change places, in their current order ([] when none may)."""
    if why_fixed():
        return []
    return [request.request_id for request in lists.current().approvals]


def answer_plan_reorder() -> bool:
    """Reconix's line after a reorder request (recorded): True when the order list follows.

    Record the operator's line first (`say_operator_line`)."""
    why = why_fixed()
    if why:
        add_chat("text", "reconix", FIXED.format(why=why), tone="muted")
        return False
    add_chat("text", "reconix", ONLY_YOU)
    return True


def _blocks(script: List[RunStep], ids: List[str]) -> List[Tuple[int, str]]:
    """Where each gated check's steps start in the run, in run order. Raises when the run
    doesn't have the expected shape (then nothing moves)."""
    starts: List[Tuple[int, str]] = []
    for request_id in ids:
        name = GATE_APPROVAL_PREFIX + request_id
        index = next(
            (i for i, step in enumerate(script) if step.kind == "gate" and step.name == name), None
        )
        if index is None or index < 1 or index + 2 >= len(script):
            raise StoreValidationError("This plan's gated checks can't be reordered.")
        before, after = script[index - 1], script[index + 1]
        if before.kind != "log" or not before.text.startswith("Risk:") or after.entry != "banner":
            raise StoreValidationError("This plan's gated checks can't be reordered.")
        starts.append((index - 1, request_id))
    return sorted(starts)


def reorder_gated(order: List[str]) -> None:
    """Put the gated checks in `order` (request ids). The run's steps move with them."""
    why = why_fixed()
    if why:
        raise StoreValidationError(FIXED.format(why=why))
    assessment = lists.current()
    current = [request.request_id for request in assessment.approvals]
    if sorted(order) != sorted(current) or len(order) != len(current):
        raise StoreValidationError("The new order must list each gated check once.")
    if order == current:
        add_chat("text", "reconix", "The order is unchanged.", tone="muted")
        return
    script = assessment.script
    blocks = _blocks(script, current)
    if blocks[0][0] <= assessment.run.cursor:
        raise StoreValidationError(FIXED.format(why="the run has reached these checks"))
    pieces = {request_id: script[start : start + _BLOCK] for start, request_id in blocks}
    for (start, _), request_id in zip(blocks, order):
        script[start : start + _BLOCK] = pieces[request_id]
    by_id = {request.request_id: request for request in assessment.approvals}
    assessment.approvals = [by_id[request_id] for request_id in order]
    labels = " → ".join(by_id[request_id].action for request_id in order)
    add_activity("USER", f"Plan order changed: {labels}", tone="ok")
    add_chat("text", "reconix", "Plan updated. Review it, then choose Run plan.", tone="muted")
    log_event("plan.reordered", labels)

