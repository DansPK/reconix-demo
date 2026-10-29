"""What the dashboard shows as it happens: assistant chat entries and activity-log rows."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Tuple

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
