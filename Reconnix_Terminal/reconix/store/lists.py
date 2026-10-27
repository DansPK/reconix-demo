"""The shared in-memory state — the app's only mutable data.

Nothing outside `reconix/store/` imports this module. Screens call the functions in
`reconix.store` instead, so this file can later be replaced by API calls without
touching the UI.

`ASSESSMENTS` holds every assessment in the session; `CURRENT` points at the one on
screen. Each assessment owns its own run, scope, findings, chat and so on (see
`models.Assessment`), so assessments are isolated and a past one can be reopened.
The audit trail, prompt history and feedback span the whole session, so they live here.
"""

import secrets
from datetime import datetime
from typing import List

from ..models import Assessment, AuditEvent, Feedback, HistoryEntry

# --- the assessments in this session --------------------------------------------------------
ASSESSMENTS: List[Assessment] = []
CURRENT: List[int] = [0]          # index into ASSESSMENTS of the current one (a list, so it's
                                  #   mutable module state shared by every store module)

# --- session-wide trails (span every assessment) --------------------------------------------
EVENTS: List[AuditEvent] = []
PROMPT_HISTORY: List[HistoryEntry] = []
FEEDBACK: List[Feedback] = []

ALL_LISTS = (ASSESSMENTS, EVENTS, PROMPT_HISTORY, FEEDBACK)

# This run of the app. Saved assessment files are named "<SESSION_ID>_<label>.json", so
# sessions never overwrite each other (every session numbers from RCX-DEMO-001 again).
SESSION_ID = f"{datetime.now():%Y%m%d-%H%M%S}-{secrets.token_hex(2)}"

# A session-wide monotonic counter: chat and activity entries both take a `seq` from it,
# so the dashboard can merge the two logs into one ordered stream.
SEQ = [0]


def next_seq() -> int:
    SEQ[0] += 1
    return SEQ[0]


def current() -> Assessment:
    """The assessment on screen."""
    index = min(CURRENT[0], len(ASSESSMENTS) - 1)
    return ASSESSMENTS[index]


def set_current(index: int) -> None:
    if not 0 <= index < len(ASSESSMENTS):
        raise IndexError(index)
    CURRENT[0] = index


def reset() -> None:
    """Empty everything (tests and a full reload start from here)."""
    for table in ALL_LISTS:
        table.clear()
    CURRENT[0] = 0
    SEQ[0] = 0
