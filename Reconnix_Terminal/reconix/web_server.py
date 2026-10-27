"""Start the read-only web dashboard (web/) for /web, so nobody has to `cd web && npm run dev`.

The dashboard's own launcher (`npm run dev` → web/scripts/serve.mjs) binds to 127.0.0.1,
makes a fresh sign-in token, writes the sign-in link where the TUI looks for it, and opens
the browser when it's ready. This module only finds the folder, installs its packages the
first time, and starts or stops that launcher quietly: its output goes to a log file,
never to the terminal the TUI draws on.
"""

import json
import os
import shutil
import signal
import socket
import subprocess
import sys
from pathlib import Path
from typing import IO, Optional
from urllib.parse import urlsplit

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
LOG_FILE = Path(os.environ.get("RECONIX_WEB_LOG") or "~/.reconix/web.log").expanduser()
PORTS_BUSY = 2   # web/scripts/serve.mjs exits with this when its ports are already taken


def problem() -> str:
    """Why the dashboard can't be started from here ("" when it can)."""
    if not (WEB_DIR / "package.json").is_file():
        return "The web dashboard folder (web/) isn't next to this install."
    if not shutil.which("npm") or not shutil.which("node"):
        return "The web dashboard needs Node.js (node and npm)."
    return ""


def needs_install() -> bool:
    """Some of its packages aren't installed yet (the first start, or new ones were added)."""
    try:
        names = json.loads((WEB_DIR / "package.json").read_text(encoding="utf-8"))["dependencies"]
    except (OSError, ValueError, KeyError, TypeError):
        names = ["next"]
    modules = WEB_DIR / "node_modules"
    return not all((modules / name / "package.json").is_file() for name in names)


def _log() -> IO[bytes]:
    """The log, readable by this user only (it may mention the dashboard's address)."""
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(LOG_FILE, flags, 0o600)
    if hasattr(os, "fchmod"):
        os.fchmod(fd, 0o600)                       # one made before this change: tighten it
    return os.fdopen(fd, "ab")


def install() -> bool:
    """`npm install`, once (it takes a few minutes). True when it worked."""
    with _log() as out:
        result = subprocess.run(
            [shutil.which("npm") or "npm", "install", "--no-audit", "--no-fund"], cwd=WEB_DIR,
            stdin=subprocess.DEVNULL, stdout=out, stderr=subprocess.STDOUT, check=False)
    return result.returncode == 0


def start(data_dir: Path, url_file: Path) -> subprocess.Popen:
    """`npm run dev` in the background, reading `data_dir` and writing its link to `url_file`
    (the places the TUI saves to and reads from). It opens the browser when it's ready.
    Its Security knowledge page runs the knowledge CLI with this same Python
    (RECONIX_PYTHON)."""
    env = {**os.environ, "RECONIX_DATA_DIR": str(data_dir),
           "RECONIX_WEB_URL_FILE": str(url_file), "RECONIX_PYTHON": sys.executable}
    url_file.unlink(missing_ok=True)      # a link left by a dashboard that died is stale
    with _log() as out:
        return subprocess.Popen(
            [shutil.which("npm") or "npm", "run", "dev", "--silent"], cwd=WEB_DIR, env=env,
            stdin=subprocess.DEVNULL, stdout=out, stderr=subprocess.STDOUT,
            **_own_group())               # stopped as one, never ^C'd with the TUI


def _own_group() -> dict:
    """Popen options for a process group of its own (Windows: a new console group)."""
    if sys.platform == "win32":
        return {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    return {"start_new_session": True}


def is_listening(url: Optional[str]) -> bool:
    """Something answers on the link's port (a link left by a server that died doesn't)."""
    if not url:
        return False
    parts = urlsplit(url)
    try:
        with socket.create_connection((parts.hostname or "127.0.0.1", parts.port or 80),
                                      timeout=0.3):
            return True
    except OSError:
        return False


def _signal(process: subprocess.Popen, sig: int) -> None:
    os.killpg(process.pid, sig)                   # npm, the launcher and Next.js together


def _kill_tree(process: subprocess.Popen) -> None:
    """Windows: end npm and everything it started (terminating npm.cmd alone would leave
    Node and Next.js running)."""
    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL, check=False)


def stop(process: subprocess.Popen) -> None:
    """Stop a dashboard this TUI started (the launcher removes its sign-in link; on
    Windows it is ended at once, and /web treats the link it leaves as stale)."""
    if process.poll() is not None:
        return
    try:
        if sys.platform == "win32":
            _kill_tree(process)
            process.wait(timeout=5)
            return
        _signal(process, signal.SIGTERM)
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if sys.platform == "win32":
            process.kill()
        else:
            _signal(process, signal.SIGKILL)
    except OSError:
        pass                                      # already gone
