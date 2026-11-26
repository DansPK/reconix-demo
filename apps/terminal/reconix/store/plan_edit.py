"""Re-drafting the plan with the operator's words (the Plan step's "Type something.").

A re-draft changes only what the scripted run then really does: which approved tool leads a
phase, and the order of the gated checks. Anything else is refused and nothing changes; the
re-drafted plan still waits for Run plan.
"""

import re
from typing import List, Optional

from ..models import GATE_PLAN, RunStep
from . import lists
from .activity import log_event
from .errors import StoreValidationError
from .parser import extract_tools
from .plan_order import FIXED, reorder_gated, wants_plan_reorder, why_fixed
from .scenario import log
from .scope import is_scope_approved
from .transcript import add_activity, add_chat

# What a person says -> the tools that test it, the preferred first.
TOPICS = (
    (r"\b(?:tls|ssl|encryption|certificates?|https)\b", ("testssl.sh",)),
    (r"\b(?:xss|cross[- ]site|reflected)\b", ("dalfox",)),
    (r"\b(?:sql|injections?|vulnerabilit\w+|cves?|misconfig\w*)\b", ("Nuclei", "Semgrep")),
    (r"\b(?:director\w+|hidden|fuzz\w*)\b", ("ffuf",)),
    (r"\b(?:crawl\w*|site map|endpoints?)\b", ("Katana", "schemathesis")),
    (r"\b(?:technolog\w+|fingerprint\w*)\b", ("whatweb",)),
    (r"\b(?:secrets?|keys?|passwords?)\b", ("gitleaks",)),
    (r"\b(?:dependenc\w+|packages?)\b", ("trivy", "osv-scanner", "grype")),
    (r"\b(?:ports?|services?)\b", ("nmap",)),
    (r"\b(?:smb|windows)\b", ("enum4linux",)),
    (r"\bsnmp\b", ("onesixtyone",)),
)
_LEADS = re.compile(r"\b(?:focus|priorit\w+|emphasi\w+|concentrate|first|start with|begin with|"
                    r"matters? most)\b", re.IGNORECASE)
_AGAINST = re.compile(r"\b(?:don'?t|do not|never|not|no|last|later|less|skip|remove|drop|"
                      r"without)\b", re.IGNORECASE)
_NOT = re.compile(r"\b(?:don'?t|do not|never|not)\b", re.IGNORECASE)
_REF = re.compile(r"\b(\d{1,2}[a-z]?)\b", re.IGNORECASE)
HELP = ("The phases keep their order and none can be dropped: each works on what the one before "
        "found. Say what comes first (“focus on TLS first”), move a gated check (“move 3b before "
        "3a”), or change the tools in the scope.")


def redraft_plan(feedback: str) -> List[str]:
    """Re-draft the plan with `feedback` (masked). Returns what changed and records a reply.
    Raises StoreValidationError, with nothing changed, when it can't be done."""
    run = lists.current().run
    if (run.waiting_gate != GATE_PLAN or run.plan_started or run.stopped
            or not is_scope_approved()):
        raise StoreValidationError("The plan can only be re-drafted while it waits for you.")
    reorder = wants_plan_reorder(feedback)
    lines = _reorder(feedback) if reorder else _lead(feedback)
    add_chat("text", "reconix", "Plan re-drafted: " + "; ".join(lines) + ". Review it, then "
             "choose Run plan; nothing runs before that.", tone="ok")
    return lines


def _reorder(feedback: str) -> List[str]:
    """Move the gated checks the line names (3a, 3b…)."""
    from .plan import plan_overview

    why = why_fixed()
    if why:
        raise StoreValidationError(FIXED.format(why=why))
    assessment = lists.current()
    current = [request.request_id for request in assessment.approvals]
    gated = [row.num.lower() for row in plan_overview() if row.gate == "approve"]
    refs = [ref.lower() for ref in _REF.findall(feedback)]
    if (_NOT.search(feedback) or not refs or len(refs) > 2 or len(set(refs)) != len(refs)
            or any(ref not in gated for ref in refs)):
        raise StoreValidationError(HELP)
    words = set(re.findall(r"[a-z]+", feedback.lower()))
    order = list(current)
    moved = current[gated.index(refs[0])]
    if len(refs) == 2 and words & {"swap", "switch"}:
        i, j = order.index(moved), order.index(current[gated.index(refs[1])])
        order[i], order[j] = order[j], order[i]
    elif len(refs) == 2 and len(words & {"before", "after"}) == 1:
        order.remove(moved)
        order.insert(order.index(current[gated.index(refs[1])]) + ("after" in words), moved)
    elif len(refs) == 1 and len(words & {"first", "last"}) == 1:
        order.remove(moved)
        order.insert(0 if "first" in words else len(order), moved)
    else:
        raise StoreValidationError(HELP)
    if order == current:
        raise StoreValidationError("The gated checks are already in that order.")
    reorder_gated(order)
    labels = {request.request_id: request.action for request in assessment.approvals}
    return ["gated checks " + " → ".join(labels[i] for i in order)]


def _lead(feedback: str) -> List[str]:
    """Let one approved tool lead its phase, in the plan's row and in the run."""
    if not _LEADS.search(feedback) or _AGAINST.search(feedback):
        raise StoreValidationError(HELP)
    assessment = lists.current()
    approved = {tool.casefold() for tool in assessment.scope.tools}
    tools = list(extract_tools(feedback))
    if not tools:
        tools = [next((name for name in names if name.casefold() in approved), names[0])
                 for pattern, names in TOPICS if re.search(pattern, feedback, re.IGNORECASE)]
    if not tools:
        raise StoreValidationError(HELP)
    if len(tools) > 1:
        raise StoreValidationError("Name one tool or topic at a time.")
    tool = tools[0]
    if tool.casefold() not in approved:
        raise StoreValidationError(f"{tool} is not in the approved scope; add it to the scope "
                                   "first.")
    task = next((t for t in assessment.plan if tool in t.tools), None)
    at = _starts(assessment.script, task.key) if task is not None else None
    if task is None or at is None or at <= assessment.run.cursor:
        raise StoreValidationError(HELP)
    if task.tools[0] == tool:
        raise StoreValidationError(f"{tool} already comes first in “{task.label}”.")
    task.tools = (tool,) + tuple(t for t in task.tools if t != tool)
    assessment.script.insert(at, log("TOOL", f"Starting with {tool}, as the plan says",
                                     pause=1.2))
    line = f"{tool} first in “{task.label}”"
    add_activity("USER", f"Plan re-drafted: {line}", tone="ok")
    log_event("plan.redrafted", line)
    return [line]


def _starts(script: List[RunStep], phase: str) -> Optional[int]:
    """Where `phase`'s own tool runs start in the run's steps (templates/base.build_rest)."""
    texts = {"discovery": "Executing permitted scan",
             "scanning": "$tool: checks on the permitted surface"}
    for i, step in enumerate(script):
        if phase == "validation" and step.kind == "phase" and step.name == "validating":
            return i + 1
        if phase in texts and step.kind == "log" and step.text.startswith(texts[phase]):
            return i
    return None


__all__ = ["redraft_plan"]
