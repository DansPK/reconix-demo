"""Open a URL or a saved file in the operator's browser without disturbing the TUI.

The desktop opener is launched detached with its output silenced (a browser that logs to
the terminal would scribble over the TUI); `webbrowser` is the fallback.
"""

import shutil
import subprocess
import sys
import webbrowser
from pathlib import Path


def open_url(url: str) -> bool:
    """True if a browser (or the desktop's opener) was launched for `url`."""
    opener = {"linux": "xdg-open", "darwin": "open"}.get(sys.platform)
    if opener and shutil.which(opener):
        try:
            subprocess.Popen([opener, url], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True)
            return True
        except OSError:
            pass
    try:
        return webbrowser.open(url)
    except (OSError, webbrowser.Error):
        return False


def open_path(display_path: str) -> bool:
    """Open a saved file (a report) with the desktop's default app."""
    try:
        url = Path(display_path).resolve().as_uri()
    except (OSError, ValueError):
        return False
    return open_url(url)
