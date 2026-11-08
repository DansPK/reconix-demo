"""What the dashboard shows as it happens: assistant chat entries and activity-log rows."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Tuple, Union

from .base import utc_now


@dataclass
class ChatEntry:
    """One entry in the AI Assistant panel.

    kind "text" is a plain line, "banner" a coloured callout, "card" a small box of
    label/value rows, and "check" a ✓ checklist line. An empty speaker continues
    the entry above it.
    """

    kind: str                  # "text" | "banner" | "card" | "check"
    speaker: str               # "reconix" | "you" | "policy" | ""
    text: str = ""             # line text, banner text, or card title
    tone: str = "default"      # "default" | "ok" | "warn" | "block" | "muted"
    rows: Tuple[Tuple[str, str], ...] = ()   # card rows (label, value)
    created_at: datetime = field(default_factory=utc_now)
    seq: int = 0               # session-monotonic order (chat and activity share one stream)


@dataclass
class ActivityEntry:
    """One row of the activity log."""

    source: str                # "SYS" | "AI" | "USER" | "TOOL" | "POLICY"
    message: str
    tone: str = "default"      # "default" | "ok" | "warn" | "block"
    created_at: datetime = field(default_factory=utc_now)
    seq: int = 0               # session-monotonic order (chat and activity share one stream)


Entry = Union[ChatEntry, ActivityEntry]


@dataclass
class MessageItem:
    """A line the live output always shows: what you typed, a Reconix reply or a banner."""

    entry: ChatEntry


@dataclass
class ThinkingItem:
    """The steps between two messages, folded into one block like Claude's thinking.

    `key` is the `seq` of the first step, so it stays the same while the block grows.
    `state` is "running" | "paused" | "stopped" | "done"; `verb` is "Thought" when no
    tool ran and "Worked" otherwise; `seconds` is how long the block took (so far).
    """

    key: int
    steps: Tuple[Entry, ...]
    state: str = "done"
    verb: str = "Worked"
    seconds: int = 0
    blocked: int = 0           # steps the policy blocked (tone "block")


StreamItem = Union[MessageItem, ThinkingItem]
