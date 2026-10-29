"""The knowledge folder on disk: `index.json` plus one `<id>.json` per source.

The format is the contract the web reads (see the plan, §4):

    index.json   {"format":"reconix.knowledge/v1","sources":[{id,name,kind,bytes,chunks,added_at,
                  source:"web"|"terminal", original:bool}]}   (older rows: terminal, false)
    <id>.json    {"format":"reconix.knowledge.source/v1","id":…,"name":…,"chunks":[passage, …]}
    <id>.orig    the original file, Fernet-encrypted (original.py); never read by the ranker

Writes are atomic and 0600 (a temp file opened `O_EXCL`, never following a symlink, then
`os.replace`), reusing `persist`'s helpers so the private-write rules live in one place.

Reads are as careful as the web reader's: a file is opened without following a link or
blocking and checked through its handle — a regular file, this user's, writable by no one
else, under its size cap (the index 256 KiB, a source 16 MiB). A file that is missing is "no
sources yet"; one that is present but fails a check or is malformed raises a clear error.
`delete_all` needs no readable index: it removes every `<id>.json` and `<id>.orig` in the
folder by its name.
"""

import json
import os
import re
import stat
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from ..errors import StoreValidationError
from ..persist import _write_private
from . import paths

INDEX_FORMAT = "reconix.knowledge/v1"
SOURCE_FORMAT = "reconix.knowledge.source/v1"
INDEX_NAME = "index.json"

MAX_SOURCES = 50
MAX_INDEX_BYTES = 256 * 1024
MAX_SOURCE_BYTES = 16 * 1024 * 1024
_ID = re.compile(r"^[0-9a-f]{32}$")
_SOURCE_FILE = re.compile(r"^[0-9a-f]{32}\.(json|orig)$")
_CORRUPT_INDEX = "The knowledge index is corrupt. Remove it with /add-on, then add files again."
_WRITABLE_BY_OTHERS = 0o022


@dataclass(frozen=True)
class Source:
    """One add-on source as the index records it.

    `cut` is not saved: `add_source` sets it when a cap cut the file short ("" otherwise), so
    the notice can say so.
    """
    id: str
    name: str
    kind: str
    bytes: int
    chunks: int
    added_at: str
    source: str = "terminal"          # who added it: "web" or "terminal"
    original: bool = False            # an encrypted `<id>.orig` was kept
    cut: str = field(default="", compare=False)


def index_path() -> Path:
    return paths.knowledge_dir() / INDEX_NAME


def source_path(source_id: str) -> Path:
    if not _ID.match(source_id or ""):
        raise StoreValidationError("Unknown add-on.")
    return paths.knowledge_dir() / f"{source_id}.json"


def valid_id(source_id: str) -> bool:
    return bool(_ID.match(source_id or ""))


# --- reading -------------------------------------------------------------------------------

def _read_private(path: Path, limit: int, problem: str) -> Optional[bytes]:
    """The bytes of `path`, or None when it doesn't exist. Opened with no-follow and
    non-blocking flags and checked through the handle; any failed check raises `problem`."""
    flags = (os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
             | getattr(os, "O_BINARY", 0))
    try:
        fd = os.open(path, flags)
    except FileNotFoundError:
        return None
    except OSError:                              # ELOOP (a link), EACCES…: never read through
        raise StoreValidationError(problem) from None
    try:
        with os.fdopen(fd, "rb") as handle:
            info = os.fstat(handle.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_size > limit or not _owned(info):
                raise StoreValidationError(problem)
            data = handle.read(limit + 1)
    except OSError:
        raise StoreValidationError(problem) from None
    if len(data) > limit:
        raise StoreValidationError(problem)
    return data


def _owned(info: os.stat_result) -> bool:
    """This user's file, writable by no one else (always true where there are no uids)."""
    if not hasattr(os, "getuid"):
        return True
    return info.st_uid == os.getuid() and not info.st_mode & _WRITABLE_BY_OTHERS


def _load_json(data: bytes, problem: str):
    try:
        return json.loads(data.decode("utf-8"))
    except (ValueError, RecursionError):         # UnicodeDecodeError is a ValueError
        raise StoreValidationError(problem) from None


def read_index() -> List[Source]:
    """Every source in `index.json`, in order; `[]` when the file does not exist yet."""
    data = _read_private(index_path(), MAX_INDEX_BYTES, _CORRUPT_INDEX)
    if data is None:
        return []
    body = _load_json(data, _CORRUPT_INDEX)
    if not isinstance(body, dict) or body.get("format") != INDEX_FORMAT:
        raise StoreValidationError(_CORRUPT_INDEX)
    rows = body.get("sources")
    if not isinstance(rows, list):
        raise StoreValidationError(_CORRUPT_INDEX)
    sources: List[Source] = []
    for row in rows:
        try:
            sources.append(Source(
                id=str(row["id"]), name=str(row["name"]), kind=str(row["kind"]),
                bytes=int(row["bytes"]), chunks=int(row["chunks"]), added_at=str(row["added_at"]),
                source="web" if row.get("source") == "web" else "terminal",
                original=row.get("original") is True,
            ))
        except (TypeError, KeyError, ValueError, AttributeError):
            raise StoreValidationError(_CORRUPT_INDEX) from None
    return sources


def safe_index() -> List[Source]:
    """`read_index()`, or `[]` when the index is unreadable (for search and clear-up)."""
    try:
        return read_index()
    except StoreValidationError:
        return []


def read_chunks(source_id: str) -> List[str]:
    """The passages of one source; `[]` if its file is missing (the index is the record)."""
    path = source_path(source_id)
    problem = f"The add-on file {path.name} is corrupt."
    data = _read_private(path, MAX_SOURCE_BYTES, problem)
    if data is None:
        return []
    body = _load_json(data, problem)
    if not isinstance(body, dict) or body.get("format") != SOURCE_FORMAT:
        raise StoreValidationError(problem)
    chunks = body.get("chunks")
    if not isinstance(chunks, list) or not all(isinstance(c, str) for c in chunks):
        raise StoreValidationError(problem)
    return chunks


def get(source_id: str) -> Optional[Source]:
    for source in read_index():
        if source.id == source_id:
            return source
    return None


# --- writing -------------------------------------------------------------------------------

def write_index(sources: List[Source]) -> None:
    paths.ensure_dir()
    body = {
        "format": INDEX_FORMAT,
        "sources": [
            {"id": s.id, "name": s.name, "kind": s.kind, "bytes": s.bytes,
             "chunks": s.chunks, "added_at": s.added_at, "source": s.source,
             "original": s.original}
            for s in sources
        ],
    }
    _write_private(index_path(), json.dumps(body, indent=2) + "\n")


def write_source(source_id: str, name: str, chunks: List[str]) -> None:
    paths.ensure_dir()
    body = {"format": SOURCE_FORMAT, "id": source_id, "name": name, "chunks": list(chunks)}
    _write_private(source_path(source_id), json.dumps(body, indent=2) + "\n")


def delete_source_file(source_id: str) -> None:
    try:
        source_path(source_id).unlink()
    except (OSError, StoreValidationError):
        pass


def delete_all() -> int:
    """Remove every source file (`<32 hex>.json`) in the folder and the index, whether or not
    the index can be read. Returns how many source files were removed."""
    folder = paths.knowledge_dir()
    try:
        names = [entry.name for entry in os.scandir(folder)]
    except OSError:                              # no folder (or not one): nothing to remove
        return 0
    removed = 0
    for name in names:
        if not _SOURCE_FILE.match(name):
            continue
        try:
            (folder / name).unlink()            # a link is removed, never followed
            removed += name.endswith(".json")      # sources counted once; `.orig` go too
        except OSError:
            pass
    try:
        index_path().unlink()
    except OSError:
        pass
    return removed
