"""Small wording helpers shared by the screens, the dialogs and the store's messages.

`counted(1, "finding")` → "1 finding", `counted(3, "finding")` → "3 findings".
`clock(moment)` → "08:49:49 UTC": the stored times are UTC, so every time shown says so.
"""

from datetime import datetime, timezone


def counted(count: int, word: str, plural: str = "") -> str:
    """`count` and `word`, plural unless the count is one (`plural` for irregular words)."""
    if count == 1:
        return f"{count:,} {word}"
    return f"{count:,} {plural or word + 's'}"


def clock(moment: datetime) -> str:
    """The time of day of `moment` in UTC, labelled (a naive time is taken as UTC)."""
    if moment.tzinfo is not None:
        moment = moment.astimezone(timezone.utc)
    return f"{moment:%H:%M:%S} UTC"
