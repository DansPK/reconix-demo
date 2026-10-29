"""Knowledge add-ons: reference files the AI may read, kept redacted on this computer.

`/add-on` points Reconix at a document (`.txt .md .json .yaml .yml .docx .pdf`); its text is
extracted, **cleaned and redacted at ingest** (secrets never reach disk), split into passages
and saved under `~/.reconix/knowledge`. The terminal chat, the `/assess` agent and the web AI
Assistant then search those passages (BM25) and quote the relevant ones as untrusted reference
material — nothing is ever run from a knowledge file. The relevant passages go to the active
model with the question, so a remote model receives them too.

This package is the only place that reads or writes the folder. The on-disk format and the
ranker are the contract the web is built to (`rank.py`, `files.py`).
"""

import dataclasses
from typing import List, Tuple

from ..activity import log_event
from ..errors import StoreValidationError
from ..redact import redact
from . import files, original, paths
from .chunk import split
from .extract import extract
from .files import MAX_SOURCES, Source
# Importing from .rank registers the submodule, so `knowledge.rank` stays the module (the web
# port's counterpart). The ranking function is aliased `_bm25` so it never shadows that name.
from .rank import BUDGET_CHARS, Passage, fit_budget, tokenize  # noqa: F401 (re-exported)
from .rank import rank as _bm25

__all__ = [
    "Source", "Passage", "add_source", "list_sources", "remove_source", "clear", "search",
    "MAX_SOURCES",
    "read_original", "ORIGINS",
]


ORIGINS = ("terminal", "web")


def add_source(path_text: str, name: str = "", origin: str = "terminal") -> Source:
    """Read a file, redact it, chunk it and save it as a new source, keeping the original
    (as read, never redacted) encrypted beside it. Returns the `Source`, whose `cut` says when
    a cap cut the file short ("" when it was read whole).

    `name` (optional) is the display name, whose base name is used (never a path); `origin` is
    "terminal" or "web".

    Raises `StoreValidationError` on any refusal (bad path, unsupported type, too large, a
    corrupt index, the 50-source limit, a folder that can't be written) and leaves nothing new
    on disk in that case.
    """
    existing = files.read_index()               # also validates the index before we add
    if len(existing) >= MAX_SOURCES:
        raise StoreValidationError(f"The knowledge limit is {MAX_SOURCES} files. Remove one first.")

    if origin not in ORIGINS:
        raise StoreValidationError("Unknown source.")
    extracted = extract(path_text, name)
    # Redact the whole text BEFORE chunking/storing, so no secret reaches disk.
    passages, passages_cut = split(redact(extracted.text))
    if not passages:
        raise StoreValidationError("That file has no readable text to add.")

    source = Source(id=_new_id(existing), name=extracted.name, kind=extracted.kind,
                    bytes=extracted.bytes, chunks=len(passages), added_at=_now(), source=origin,
                    original=True)
    _save(source, passages, existing, extracted.data)
    log_event("knowledge.added", f"{source.name} ({source.kind}, {source.chunks} passages)")
    cut = f"cut to the first {len(passages):,} passages" if passages_cut else extracted.cut
    return dataclasses.replace(source, cut=cut)


def _save(source: Source, passages: List[str], existing: List[Source],
          data: bytes) -> None:
    """Write the source's file, then the index; on a failure remove the new file again."""
    try:
        original.write_original(source.id, data)
        files.write_source(source.id, source.name, passages)
        files.write_index(existing + [source])
    except StoreValidationError:
        _discard(source.id)
        raise
    except OSError:
        _discard(source.id)                     # never leave a file the index doesn't list
        raise StoreValidationError(f"Couldn't save the knowledge file; check that "
                                   f"{paths.knowledge_dir()} is yours and writable.") from None


def _discard(source_id: str) -> None:
    files.delete_source_file(source_id)
    original.delete_original(source_id)


def list_sources() -> List[Source]:
    """Every saved source, in the order it was added."""
    return files.read_index()


def remove_source(source_id: str) -> Source:
    """Remove one source (its index entry and its file). Raises if it isn't there."""
    remaining = []
    removed = None
    for source in files.read_index():
        if source.id == source_id:
            removed = source
        else:
            remaining.append(source)
    if removed is None:
        raise StoreValidationError("Unknown add-on.")
    try:
        files.write_index(remaining)
    except OSError:
        raise StoreValidationError("Couldn't update the knowledge index.") from None
    _discard(source_id)
    log_event("knowledge.removed", removed.name)
    return removed


def read_original(source_id: str) -> bytes:
    """The decrypted original of a source. Raises `StoreValidationError` for an unknown id or
    a source with no original (an older one)."""
    source = files.get(source_id) if files.valid_id(source_id) else None
    if source is None:
        raise StoreValidationError("Unknown add-on.")
    if not source.original:
        raise StoreValidationError("No original was kept for that file.")
    return original.read_original(source_id)


def clear() -> int:
    """Remove every source file and the index, even when the index is unreadable. Returns how
    many source files were removed."""
    count = files.delete_all()
    log_event("knowledge.cleared", f"{count} file(s)")
    return count


def search(query: str, k: int = 4) -> List[Passage]:
    """The relevant passages for `query` across every readable source: BM25, the top `k` that
    hold at least min(2, query tokens) distinct query tokens and score above 0 (`rank.rank`).

    An unreadable index searches nothing, and a source whose file is unreadable is skipped (as
    the web does), so `N` and `avgdl` count only the passages actually searched.
    """
    corpus: List[Tuple[str, int, str]] = []
    for source in files.safe_index():
        try:
            chunks = files.read_chunks(source.id)
        except StoreValidationError:
            continue
        for index, text in enumerate(chunks):
            corpus.append((source.name, index, text))
    return _bm25(corpus, query, top=k)


# --- helpers -------------------------------------------------------------------------------

def _new_id(existing: List[Source]) -> str:
    import secrets

    taken = {s.id for s in existing}
    while True:
        candidate = secrets.token_hex(16)
        if candidate not in taken:
            return candidate


def _now() -> str:
    from ...models.base import utc_now
    return utc_now().isoformat(timespec="seconds")
