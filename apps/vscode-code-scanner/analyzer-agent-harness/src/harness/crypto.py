"""Fernet encryption for stored LLM provider API keys.

The key file is created 0600 inside a 0700 directory on first use (atomically, so it is
never briefly world-readable). Only `encrypt`/`decrypt` touch the plaintext key; the
database stores the Fernet token plus a safe `hint` like ``sk-…3f9a``. The plaintext is
never logged or printed. The key path is passed in (``cfg.llm_key_file``) so it lives on
the same ``/data`` volume as the database.

Note: the 0600/0700 mode bits are effectively no-ops on Windows NTFS; the production
deployment runs on Linux with a ``/data`` volume, where they apply.
"""

import os
from pathlib import Path

from cryptography.fernet import Fernet


def load_or_create_key(path):
    """Return the Fernet key at `path`, generating and persisting it (0600) on first use."""
    path = Path(path)
    if path.exists():
        return path.read_bytes()
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    key = Fernet.generate_key()
    try:
        fd = os.open(str(path), os.O_CREAT | os.O_WRONLY | os.O_EXCL, 0o600)
    except FileExistsError:  # created between the exists() check and here
        return path.read_bytes()
    with os.fdopen(fd, "wb") as handle:
        handle.write(key)
    return key


class Crypto:
    """Fernet encrypt/decrypt bound to one key file."""

    def __init__(self, key_file):
        self.key_file = key_file
        self._fernet = None

    def _f(self):
        if self._fernet is None:
            self._fernet = Fernet(load_or_create_key(self.key_file))
        return self._fernet

    def encrypt(self, plaintext):
        return self._f().encrypt(plaintext.encode("utf-8"))

    def decrypt(self, token):
        return self._f().decrypt(token).decode("utf-8")


def hint(plaintext):
    """A safe-to-display fingerprint of a key, e.g. ``sk-…3f9a`` (never the key)."""
    plaintext = (plaintext or "").strip()
    if not plaintext:
        return ""
    head = plaintext[:3]
    tail = plaintext[-4:] if len(plaintext) >= 8 else ""
    return f"{head}…{tail}" if tail else f"{head}…"
