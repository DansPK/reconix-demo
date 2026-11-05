"""Saving assessments for the web dashboard: one JSON file per assessment, no secrets.

The TUI keeps working in memory; after every change the dashboard calls `autosave()`,
which writes the current assessment's `snapshot()` to `DATA_DIR/<uid>.json` when (and
only when) its content changed. Writes are atomic (temp file + `os.replace`), the folder
is private to the user (0700) and each file is 0600. `RECONIX_SAVE=0` turns saving off;
`RECONIX_DATA_DIR` moves the folder. A failed write never stops the run, and a folder that
isn't a private directory of this user is refused rather than written into. `close_session()`
(called when the app quits) marks every saved assessment of this session as closed.
"""

import hashlib
import json
import os
import queue
import stat
import tempfile
import threading
from pathlib import Path
from typing import Dict, Optional, Tuple

from ..models import Assessment
from ..models.base import utc_now
from . import lists
from .snapshot import snapshot, uid_for

DATA_DIR = Path(os.environ.get("RECONIX_DATA_DIR") or "~/.reconix/assessments").expanduser()
ENABLED = os.environ.get("RECONIX_SAVE", "1").strip().lower() not in {"0", "false", "no", "off"}

# Kept for `web_server.start()`'s signature; the static-demo dashboard needs no sign-in link.
WEB_URL_FILE = Path(os.environ.get("RECONIX_WEB_URL_FILE") or "~/.reconix/web.url").expanduser()

_written: Dict[str, str] = {}     # file path -> digest of the content last written there


def web_dashboard_url() -> Optional[str]:
    """The static-demo dashboard's URL (no sign-in). `web/scripts/serve.mjs` binds here.

    Always a loopback http URL on the dashboard's port (RECONIX_WEB_PORT, default 3100),
    so `/web` never sends the operator's browser anywhere but this computer.
    """
    port = (os.environ.get("RECONIX_WEB_PORT") or "3100").strip() or "3100"
    return f"http://127.0.0.1:{port}/"


def file_for(assessment: Assessment) -> Path:
    return DATA_DIR / f"{uid_for(assessment)}.json"


def autosave() -> bool:
    """Save the current assessment if it changed. Returns False only when saving failed.

    An assessment that has not started yet (the empty one every session opens with) is
    not saved, so the folder only holds real work.
    """
    if not ENABLED:
        return True
    assessment = lists.current()
    if not assessment.run.started:
        return True
    return save(assessment)


def close_session() -> bool:
    """The app is quitting: save every started assessment once more, marked closed."""
    if not ENABLED:
        return True
    flush_saves()        # let any queued background write land before the final closed snapshot
    results = [save(a, session_closed=True) for a in lists.ASSESSMENTS if a.run.started]
    return all(results)


# --- background writer -----------------------------------------------------------------------
# The run plays on the UI thread and asks to save after every step. Building the snapshot is
# quick and must stay on this thread (it reads the live store), but the disk write — a temp
# file, an fsync-like replace, and on some systems an antivirus scan — can stall the UI. So
# `autosave_async()` snapshots here and hands the bytes to a daemon thread that does the write,
# coalescing to the newest pending content per file. The synchronous `save()`/`autosave()`
# stay for the tests and for `close_session()`.
_queue: "queue.Queue[Optional[Tuple[Path, str, str]]]" = queue.Queue()
_queued: Dict[str, str] = {}          # path -> digest already queued (so we don't re-queue it)
_writer: Optional[threading.Thread] = None
_writer_lock = threading.Lock()
_save_failed = False


def _writer_loop() -> None:
    global _save_failed
    while True:
        job = _queue.get()
        try:
            if job is None:
                return
            path, text, digest = job
            try:
                _write_private(path, text)
                _written[str(path)] = digest
            except (OSError, ValueError, TypeError):
                _save_failed = True
        finally:
            _queue.task_done()


def _ensure_writer() -> None:
    global _writer
    with _writer_lock:
        if _writer is None or not _writer.is_alive():
            _writer = threading.Thread(target=_writer_loop, name="reconix-save", daemon=True)
            _writer.start()


def autosave_async() -> None:
    """Non-blocking autosave for the UI: snapshot on this thread, write on a background thread,
    so the run never stalls on disk I/O. A no-op when nothing changed since the last save."""
    if not ENABLED:
        return
    assessment = lists.current()
    if not assessment.run.started:
        return
    path = file_for(assessment)
    key = str(path)
    try:
        data = snapshot(assessment)
        body = json.dumps(data, sort_keys=True)
        digest = hashlib.sha256(body.encode("ascii")).hexdigest()
    except (OSError, ValueError, TypeError):
        return
    if _queued.get(key) == digest or (_written.get(key) == digest and path.exists()):
        return                                       # already written or already queued
    data["saved_at"] = utc_now().isoformat(timespec="seconds")
    _queued[key] = digest
    _ensure_writer()
    _queue.put((path, json.dumps(data, indent=2) + "\n", digest))


def flush_saves() -> None:
    """Wait for queued background writes to finish (the app calls this before it quits)."""
    _queue.join()


def save_failed() -> bool:
    """True if a background write has failed since the app started (best-effort UI warning)."""
    return _save_failed


def save(assessment: Assessment, *, session_closed: bool = False) -> bool:
    path = file_for(assessment)
    try:
        data = snapshot(assessment, session_closed=session_closed)
        body = json.dumps(data, sort_keys=True)          # ASCII: nothing can fail to encode
        digest = hashlib.sha256(body.encode("ascii")).hexdigest()
        if _written.get(str(path)) == digest and path.exists():
            return True
        data["saved_at"] = utc_now().isoformat(timespec="seconds")
        _write_private(path, json.dumps(data, indent=2) + "\n")
    except (OSError, ValueError, TypeError):
        return False
    _written[str(path)] = digest
    return True


def _private_dir(folder: Path) -> None:
    """Create `folder` (0700) or check it is a directory only this user can write to.

    Missing parents (such as ~/.reconix, which also holds the web log) are created 0700 too.
    """
    missing = []
    parent = folder
    while not parent.exists():
        missing.append(parent)
        parent = parent.parent
    for created in reversed(missing):
        created.mkdir(mode=0o700, exist_ok=True)
    info = folder.stat()
    if not stat.S_ISDIR(info.st_mode):
        raise NotADirectoryError(str(folder))
    if hasattr(os, "getuid") and info.st_uid != os.getuid():
        raise PermissionError(f"{folder} belongs to another user")
    if info.st_mode & 0o077:
        os.chmod(folder, 0o700)                  # ours: tighten it (raises if it can't)


def _write_private(path: Path, text: str) -> None:
    """Write `text` to `path` atomically, readable by this user only."""
    _private_dir(path.parent)
    # mkstemp: a new random name opened with O_EXCL and mode 0600, so a planted file or
    # symlink is never followed; os.replace then swaps it in atomically.
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="ascii") as handle:
            handle.write(text)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
