"""The original files: `<id>.orig`, Fernet-encrypted with the knowledge key.

An add-on keeps the file as it was read (at most 10 MB, never redacted: only the passages
are) so the operator can open it again. The bytes are encrypted with a key of their own
(`paths.key_file()`: `RECONIX_KNOWLEDGE_KEY_FILE`, default `~/.reconix/knowledge.key`), never
the LLM's. The key file is created 0600 with `O_EXCL`; it is refused when it is not a regular
file of this user, is readable by group or others, or is not a Fernet key. The `.orig` file is
written atomically, 0600, and read without following a link. Neither the key nor the contents
are ever logged.
"""

import os
import stat
import tempfile
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from ..errors import StoreValidationError
from . import paths

# 10 MB of file, plus Fernet's base64 and header overhead, with room to spare.
MAX_ORIGINAL_BYTES = 16 * 1024 * 1024
_KEY_LEN = 44
_GROUP_OTHER = 0o077
_KEY_PROBLEM = ("The knowledge key file can't be used; it must be a Fernet key owned by you and "
                "readable only by you (mode 0600).")
_CANT_KEEP = "Couldn't keep the original file; nothing was saved."
_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0)


def original_path(source_id: str) -> Path:
    from .files import valid_id
    if not valid_id(source_id):
        raise StoreValidationError("Unknown add-on.")
    return paths.knowledge_dir() / f"{source_id}.orig"


def _read_key(path: Path) -> bytes:
    """The key bytes; `FileNotFoundError` when there is no key file yet."""
    try:
        fd = os.open(path, os.O_RDONLY | _NOFOLLOW)
    except FileNotFoundError:
        raise
    except OSError:
        raise StoreValidationError(_KEY_PROBLEM) from None
    try:
        with os.fdopen(fd, "rb") as handle:
            info = os.fstat(handle.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_size != _KEY_LEN:
                raise StoreValidationError(_KEY_PROBLEM)
            if os.name == "posix" and (info.st_uid != os.getuid()
                                       or info.st_mode & _GROUP_OTHER):
                raise StoreValidationError(_KEY_PROBLEM)
            key = handle.read(_KEY_LEN + 1)
    except OSError:
        raise StoreValidationError(_KEY_PROBLEM) from None
    try:
        Fernet(key)
    except (ValueError, TypeError):
        raise StoreValidationError(_KEY_PROBLEM) from None
    return key


def _fernet(create: bool) -> Fernet:
    """The cipher; with `create`, the key file is made on first use."""
    path = paths.key_file()
    try:
        return Fernet(_read_key(path))
    except FileNotFoundError:
        if not create:
            raise StoreValidationError(_KEY_PROBLEM) from None
    try:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        key = Fernet.generate_key()
        fd = os.open(path, os.O_CREAT | os.O_WRONLY | os.O_EXCL | _NOFOLLOW, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(key)
    except FileExistsError:                       # made by another process just now
        return Fernet(_read_key(path))
    except OSError:
        raise StoreValidationError(_CANT_KEEP) from None
    return Fernet(key)


def write_original(source_id: str, data: bytes) -> None:
    """Encrypt `data` and save it as `<id>.orig` (0600, atomic)."""
    token = _fernet(create=True).encrypt(data)
    path = original_path(source_id)
    paths.ensure_dir()
    try:
        fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    except OSError:
        raise StoreValidationError(_CANT_KEEP) from None
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(token)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def read_original(source_id: str) -> bytes:
    """The decrypted original; raises `StoreValidationError` when there is none or it can't be
    read."""
    path = original_path(source_id)
    problem = "The original file can't be read."
    try:
        fd = os.open(path, os.O_RDONLY | _NOFOLLOW | getattr(os, "O_NONBLOCK", 0))
    except FileNotFoundError:
        raise StoreValidationError("No original was kept for that file.") from None
    except OSError:
        raise StoreValidationError(problem) from None
    try:
        with os.fdopen(fd, "rb") as handle:
            info = os.fstat(handle.fileno())
            if (not stat.S_ISREG(info.st_mode) or info.st_size > MAX_ORIGINAL_BYTES
                    or (os.name == "posix" and (info.st_uid != os.getuid()
                                                or info.st_mode & 0o022))):
                raise StoreValidationError(problem)
            token = handle.read(MAX_ORIGINAL_BYTES + 1)
    except OSError:
        raise StoreValidationError(problem) from None
    try:
        return _fernet(create=False).decrypt(token)
    except InvalidToken:
        raise StoreValidationError(problem) from None


def delete_original(source_id: str) -> None:
    try:
        original_path(source_id).unlink()
    except (OSError, StoreValidationError):
        pass
