"""Short answers for prompt lines that are not a target — rule-based, no LLM.

Before a run, a line that names no target does not start one: Reconix answers in one or
two sentences and says what to type. A keyword without a target ("scan my network") gets
what that template needs. During a run, a greeting or thanks gets a friendly line and
anything else the usual pointer to the keys. After the run (completed or stopped) the chat
goes on about the same assessment: thanks and greetings get a friendly line, anything else a
pointer to the findings, the report and /new.
"""

import re

from .parser import keyword_hint
from .targets import needs

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
