"""Where the knowledge add-ons live on disk.

`~/.reconix/knowledge` by default (`RECONIX_KNOWLEDGE_DIR` moves it, as tests do). The folder
is private to this user (0700); `ensure_dir()` creates it so and refuses one owned by another
user, reusing `persist`'s private-directory check so the rules stay in one place.
"""

import os
from pathlib import Path

from ..persist import _private_dir

KNOWLEDGE_DIR = Path(
    os.environ.get("RECONIX_KNOWLEDGE_DIR") or "~/.reconix/knowledge"
).expanduser()


def knowledge_dir() -> Path:
    """The current knowledge directory (read freshly so tests can repoint the constant)."""
    return KNOWLEDGE_DIR


def ensure_dir() -> Path:
    """Create the folder 0700 (and its parents) or check it is this user's private directory."""
    folder = knowledge_dir()
    _private_dir(folder)
    return folder


def key_file() -> Path:
    """The knowledge key file: `RECONIX_KNOWLEDGE_KEY_FILE`, else `~/.reconix/knowledge.key`.
    Read freshly so tests and the CLI can repoint it. It is a separate key from the LLM's."""
    return Path(os.environ.get("RECONIX_KNOWLEDGE_KEY_FILE") or "~/.reconix/knowledge.key"
                ).expanduser()
