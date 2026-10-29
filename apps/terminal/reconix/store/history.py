"""Prompt history: every line submitted at a prompt, oldest first."""

from typing import List

from ..models import HistoryEntry
from . import lists
from .assessment import MAX_REQUEST_LENGTH
from .errors import StoreValidationError

MAX_HISTORY = 100


def add_history(text: str) -> HistoryEntry:
    """Remember a submitted request or command (consecutive repeats are kept once)."""
    text = " ".join(text.split())
    if not text:
        raise StoreValidationError("Nothing to add to the history.")
    if len(text) > MAX_REQUEST_LENGTH:
        raise StoreValidationError(f"Keep prompts under {MAX_REQUEST_LENGTH} characters.")
    if lists.PROMPT_HISTORY and lists.PROMPT_HISTORY[-1].text == text:
        return lists.PROMPT_HISTORY[-1]
    entry = HistoryEntry(text)
    lists.PROMPT_HISTORY.append(entry)
    del lists.PROMPT_HISTORY[:-MAX_HISTORY]
    return entry


def list_history() -> List[str]:
    return [entry.text for entry in lists.PROMPT_HISTORY]
