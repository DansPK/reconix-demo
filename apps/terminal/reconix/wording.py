"""Small wording helpers shared by the screens, the dialogs and the store's messages.

`counted(1, "finding")` → "1 finding", `counted(3, "finding")` → "3 findings".
`clock(moment)` → "15:49:49": the stored times are UTC; what is shown is the computer's local time.
"""

from datetime import datetime, timezone


def counted(count: int, word: str, plural: str = "") -> str:
    """`count` and `word`, plural unless the count is one (`plural` for irregular words)."""
    if count == 1:
        return f"{count:,} {word}"
    return f"{count:,} {plural or word + 's'}"


def clock(moment: datetime) -> str:
    """The time of day of `moment` in the computer's local zone (a naive time is taken as UTC)."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return f"{moment.astimezone():%H:%M:%S}"
