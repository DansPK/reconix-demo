"""The live output read the way Claude shows a conversation: messages, the work between folded.

A message is a chat line or banner: what you typed and what Reconix tells you. Everything
else (activity rows, result cards, checklist lines, the model's reasoning) is a step, and
the steps between two messages form one thinking block. The web's `lib/data/thinking.ts`
ports this: change both; `web/tests/thinking-vectors.json` checks both.
"""

from datetime import datetime
from typing import Iterable, List, Optional

from ..models import ActivityEntry, ChatEntry, Entry, MessageItem, StreamItem, ThinkingItem
from ..models.base import utc_now
from .errors import StoreValidationError
from .transcript import list_activity, list_chat

MESSAGE_KINDS = ("text", "banner")
LIVE_STATES = ("running", "paused", "stopped", "done")


def stream() -> List[Entry]:
    """Chat and activity entries of the current assessment, in the order they happened."""
    entries: List[Entry] = list(list_chat()) + list(list_activity())
    return sorted(entries, key=lambda entry: entry.seq)


def is_message(entry: Entry) -> bool:
    return isinstance(entry, ChatEntry) and entry.kind in MESSAGE_KINDS


def group_stream(
    entries: Iterable[Entry], live: str = "done", now: Optional[datetime] = None
) -> List[StreamItem]:
    """Messages, with each run of steps between them folded into a `ThinkingItem`.

    `live` is where the run stands; it only applies to a block at the very end (a block
    followed by a message is always done). A running block counts its time up to `now`.
    """
    if live not in LIVE_STATES:
        raise StoreValidationError(f"Unknown run state {live}.")
    items: List[StreamItem] = []
    steps: List[Entry] = []
    for entry in sorted(entries, key=lambda e: e.seq):
        if not is_message(entry):
            steps.append(entry)
            continue
        if steps:
            items.append(_block(steps, "done", entry.created_at))
            steps = []
        items.append(MessageItem(entry))
    if steps:
        end = (now or utc_now()) if live == "running" else steps[-1].created_at
        items.append(_block(steps, live, end))
    return items


def block_seconds(block: ThinkingItem, now: Optional[datetime] = None) -> int:
    """How long a block has taken: counted live while it runs, fixed once it is done."""
    if block.state != "running":
        return block.seconds
    return _seconds(block.steps[0].created_at, now or utc_now())


def _block(steps: List[Entry], state: str, end: datetime) -> ThinkingItem:
    tool_ran = any(isinstance(s, ActivityEntry) and s.source == "TOOL" for s in steps)
    return ThinkingItem(
        key=steps[0].seq,
        steps=tuple(steps),
        state=state,
        verb="Worked" if tool_ran else "Thought",
        seconds=_seconds(steps[0].created_at, end),
        blocked=sum(1 for s in steps if s.tone == "block"),
    )


def _seconds(start: datetime, end: datetime) -> int:
    return max(0, int((end - start).total_seconds()))
