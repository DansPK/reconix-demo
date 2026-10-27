"""Flexible LLM: Fernet encryption for stored API keys.

The key file (`config.KEY_FILE`) is created 0600 inside a 0700 directory on first use.
Only `encrypt`/`decrypt` ever touch the plaintext key; the database stores the Fernet
token plus a safe `hint` like ``sk-…3f9a``. The plaintext is never logged or printed.
"""

import os

from cryptography.fernet import Fernet

from . import config


def _fernet() -> Fernet:
    return Fernet(load_or_create_key())


def load_or_create_key() -> bytes:
    """Return the Fernet key, generating and persisting it (0600) on first use."""
    path = config.KEY_FILE
    if path.exists():
        return path.read_bytes()
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    key = Fernet.generate_key()
    # Create 0600 atomically so the key is never briefly world-readable.
    try:
        fd = os.open(str(path), os.O_CREAT | os.O_WRONLY | os.O_EXCL, 0o600)
    except FileExistsError:                 # created between the exists() check and here
        return path.read_bytes()
    with os.fdopen(fd, "wb") as handle:
        handle.write(key)
    return key


def encrypt(plaintext: str) -> bytes:
    return _fernet().encrypt(plaintext.encode("utf-8"))


def decrypt(token: bytes) -> str:
    return _fernet().decrypt(token).decode("utf-8")


def hint(plaintext: str) -> str:
    """A safe-to-display fingerprint of a key, e.g. ``sk-…3f9a`` (never the key)."""
    plaintext = plaintext.strip()
    if not plaintext:
        return ""
    head = plaintext[:3]
    tail = plaintext[-4:] if len(plaintext) >= 8 else ""
    return f"{head}…{tail}" if tail else f"{head}…"
