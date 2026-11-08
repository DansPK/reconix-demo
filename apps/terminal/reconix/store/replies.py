"""Short answers for prompt lines that are not a target — rule-based, no LLM.

Before a run, a line that names no target does not start one: Reconix answers in one or
two sentences and says what to type. A keyword without a target ("scan my network") gets
what that template needs. During a run, a greeting or thanks gets a friendly line and
anything else the usual pointer to the keys. After the run (completed or stopped) the chat
goes on about the same assessment: thanks and greetings get a friendly line, anything else a
pointer to the findings, the report and /new.
"""

import difflib
import re
from typing import List, NamedTuple, Optional, Tuple

from ..models import GATE_SCOPE
from . import lists
from .parser import keyword_hint
from .targets import needs
from .transcript import add_chat

START = ("Type a target to start — a URL, an IPv4 address or range, or a git repo or local "
         "path — or /template to pick a template.")
RUNNING = ("I can't take new instructions while an assessment runs. Use "
           "/status, /findings, /audit and /report, or /new to start over.")
AFTER_RUN = ("The assessment is finished. Use /findings, /report, or /new to start another.")

_GREETING = re.compile(r"^\W*(?:hi|hello|hey|hiya|howdy|yo|greetings|"
                       r"good (?:morning|afternoon|evening))\b", re.IGNORECASE)
_THANKS = re.compile(r"\b(?:thanks|thank you|thx|cheers)\b", re.IGNORECASE)
_BYE = re.compile(r"^\W*(?:bye|goodbye|see you|good night)\b", re.IGNORECASE)
_HELP = re.compile(r"\b(?:help|what can you do|what do you do|who are you|what is reconix|"
                   r"how does (?:this|it) work|how do i|usage)\b", re.IGNORECASE)


def reply_to(text: str) -> str:
    """The answer to a line that names no target (before a run)."""
    hint = keyword_hint(text)
    if hint:
        return needs(hint)
    if _BYE.search(text):
        return "Bye! Press Ctrl+Q to quit."
    if _THANKS.search(text):
        return "You're welcome!"
    if _GREETING.search(text):
        return f"Hi! {START}"
    if _HELP.search(text):
        return f"I run authorized security tests and ask before every risky step. {START}"
    return f"I didn't find a target in that. {START}"


def reply_while_running(text: str) -> str:
    """The answer to a line typed while an assessment runs."""
    if _THANKS.search(text):
        return "You're welcome. The assessment keeps going; /findings shows the findings so far."
    if _GREETING.search(text):
        return ("Hi! The assessment is running. /status shows the live run; /findings, /audit "
                "and /report the rest.")
    return RUNNING


def reply_after_run(text: str) -> str:
    """The answer to a line typed after the assessment finished (completed or stopped)."""
    if _THANKS.search(text):
        return "You're welcome. /findings and /report have everything from this assessment."
    if _GREETING.search(text):
        return ("Hi! This assessment is finished. Use /findings and /report, or /new to "
                "start another.")
    return AFTER_RUN


# --- the chat inside a step (screens/base.py): built-in answers, never a model ---------------
# Only the operator moves the flow, and only with the step's menu. A plain word check spots a
# decision ("approve that scope", "yes"), a request to see the scope or plan, or to change the
# scope's ports or tools; anything else gets a short pointer. Typos in the long verbs count.

VERBS = ["approve", "accept", "confirm", "reject", "execute", "proceed", "continue"]
SHORT_VERBS = {"run", "start", "go", "decline", "deny"}
GO_AHEAD = {"yes", "y", "yep", "yeah", "ok", "okay", "sure", "go", "go ahead", "proceed",
            "continue", "do it", "start", "let's go", "lets go", "next", "approve", "run"}
QUESTION_WORDS = ("should", "can", "could", "is", "are", "what", "why", "how", "when", "do",
                  "does", "will", "would", "which")
_WORD = re.compile(r"[a-z']+")
_VIEW = re.compile(
    r"^(?:please\s+)?(?:show|see|view|print|display|give|list|what(?:'s| is)|where(?:'s| is))?"
    r"\s*(?:me\s+|us\s+)?(?:the\s+|my\s+|this\s+|our\s+)?(?:current\s+|test\s+)?"
    r"(scope|plan)(?:\s+manifest)?\s*(?:again|now|please)?\s*[?.!]*$",
    re.IGNORECASE,
)
_SCOPE_VERB = re.compile(r"\b(?:add|remove|drop|allow|open|include|exclude|delete|change|edit|"
                         r"extend|disallow|close)\b", re.IGNORECASE)
_SCOPE_SUBJECT = re.compile(r"\b(?:ports?|tools?|scope)\b", re.IGNORECASE)

NOTHING_YET = "Only you decide this: choose below. Nothing changes until you do."
NOTHING_WAITS = "Nothing waits for your decision here."
SCOPE_ONLY_YOU = "Only you can change the scope. Tick what it allows, then press Enter to save."
SCOPE_LOCKED = ("The scope is approved and locked, so it can't change now. Start a new "
                "assessment (/new) to test with a different scope.")
STEP_HINTS = {
    "template": "Ask to see the scope, or to add or remove a port or tool.",
    "plan": "Ask to see the plan, or to move a gated check (move 3b before 3a).",
    "approval": "Ask to see the plan or the scope.",
}


def _words(text: str) -> List[str]:
    return _WORD.findall(text.casefold())


def _has_verb(text: str) -> bool:
    return any(word in SHORT_VERBS or difflib.get_close_matches(word, VERBS, n=1, cutoff=0.8)
               for word in _words(text))


def _is_question(text: str) -> bool:
    words = _words(text)
    return text.rstrip().endswith("?") or bool(words and words[0] in QUESTION_WORDS)


def wants_decision(text: str) -> bool:
    """A line that makes the decision itself: "yes", "go ahead", "apporve that scope"."""
    return " ".join(_words(text)) in GO_AHEAD or (_has_verb(text) and not _is_question(text))


def asks_about_decision(text: str) -> bool:
    """A question about the decision ("should I approve it?"): answered, then the menu."""
    return _has_verb(text) and _is_question(text)


def wants_view(text: str) -> str:
    """ "show the scope", "give the plan": "scope" or "plan" ("" for anything else)."""
    match = _VIEW.match(text.strip())
    return match.group(1).casefold() if match else ""


def view_reply(view: str) -> str:
    """Reconix's line before the scope or plan card (recorded, like any reply)."""
    if view not in ("scope", "plan"):
        raise ValueError(f"No card for {view!r}.")
    text = f"The {view} as it stands now:"
    add_chat("text", "reconix", text)
    return text


def decision_reply(pending: bool) -> str:
    """Reconix's own line before the step's menu (recorded). `pending`: a decision waits."""
    text = NOTHING_YET if pending else NOTHING_WAITS
    add_chat("text", "reconix", text)
    return text


def step_reply(flow_name: str, text: str) -> str:
    """The built-in answer to any other line in a step's chat (recorded): advice only, the
    step still waits for the operator."""
    if _THANKS.search(text):
        answer = "You're welcome. The step waits for your choice below."
    elif _GREETING.search(text):
        answer = "Hi! I'm here while you decide this step."
    else:
        answer = ("I can't change this step from the chat: you decide with the choices "
                  "below. " + STEP_HINTS.get(flow_name, "Esc goes back to the step.")).strip()
    add_chat("text", "reconix", answer, tone="muted")
    return answer


class ScopeChoices(NamedTuple):
    """The tick list's rows: (value, ticked). `ports` is empty for a scope without ports."""

    ports: List[Tuple[int, bool]]
    tools: List[Tuple[str, bool]]


def wants_scope_change(text: str) -> bool:
    """A line that asks to add or remove the scope's ports or tools ("add port 3389")."""
    return bool(_SCOPE_VERB.search(text) and _SCOPE_SUBJECT.search(text))


def answer_scope_change() -> Optional[ScopeChoices]:
    """Reply to a scope-change line (recorded): the rows to tick, or None once the scope can
    no longer change. The list starts with exactly what the scope allows today."""
    assessment = lists.current()
    scope = assessment.scope
    if (scope is None or scope.status == "APPROVED"
            or assessment.run.waiting_gate != GATE_SCOPE):
        add_chat("text", "reconix", SCOPE_LOCKED, tone="muted")
        return None
    from .templates import MODULES  # (imported here: the templates import the parser)

    ports: List[Tuple[int, bool]] = []
    if scope.kind == "network":
        module = MODULES.get(assessment.selected_template or "")
        known = sorted(set(getattr(module, "ALLOWED_PORTS", [])) | set(scope.allowed_ports))
        ports = [(port, port in scope.allowed_ports) for port in known]
    add_chat("text", "reconix", SCOPE_ONLY_YOU)
    return ScopeChoices(ports, [(tool, True) for tool in scope.tools])
