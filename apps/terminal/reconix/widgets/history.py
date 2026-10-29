"""↑/↓ navigation through previous prompts, like a shell or Claude Code."""

from typing import Callable, List, Optional


class PromptHistory:
    """Walks a snapshot of past prompts and restores the unsent draft at the end."""

    def __init__(self, provider: Callable[[], List[str]]) -> None:
        self._provider = provider
        self._entries: List[str] = []
        self._index: Optional[int] = None   # None = not browsing
        self._draft = ""

    @property
    def browsing(self) -> bool:
        return self._index is not None

    def older(self, current: str) -> Optional[str]:
        """The previous entry, or None when there is nothing older."""
        if self._index is None:
            self._entries = list(self._provider())
            if not self._entries:
                return None
            self._draft = current
            self._index = len(self._entries)
        if self._index == 0:
            return None
        self._index -= 1
        return self._entries[self._index]

    def newer(self) -> Optional[str]:
        """The next entry; past the newest, the saved draft. None when not browsing."""
        if self._index is None:
            return None
        self._index += 1
        if self._index < len(self._entries):
            return self._entries[self._index]
        draft = self._draft
        self.reset()
        return draft

    def reset(self) -> None:
        self._index = None
        self._entries = []
        self._draft = ""
