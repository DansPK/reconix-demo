"""Helpers shared by the model modules."""

from datetime import datetime, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
