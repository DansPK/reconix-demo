"""/web: open the web dashboard, starting it first if it isn't running.

The first /web of a session starts `npm run dev` in web/ in the background (and installs
its packages if they're missing); the dashboard opens the browser itself once it's
ready. Later /web calls just open it. A dashboard this TUI started stops when it quits.
"""

import threading
from typing import Optional, Tuple

from .. import browser, store, web_server
from ..store import persist

READY_TIMEOUT = 180.0      # seconds: a first `next dev` compile (or an install) is slow
POLL_EVERY = 0.5

Note = Tuple[str, str]     # (message, severity)


class WebDashboardMixin:
    """Mixed into ReconixApp."""

    def _init_web(self) -> None:
        self._web_process = None               # the dashboard this TUI started, if any
        self._web_starting = False
        self._web_quit = threading.Event()     # set on quit: stop waiting for it

    def open_web_dashboard(self) -> None:
        url = store.web_dashboard_url()
        if url and web_server.is_listening(url):
            self._open_in_browser(url)
            return
        if self._web_starting:
            self._web_note("The web dashboard is still starting. It opens in your browser "
                           "when it's ready.")
            return
        why = web_server.problem()
        if why:
            self._web_note(f"{why} Or start it yourself:  cd web && npm run dev",
                           severity="warning")
            return
        first = " First time: installing its packages takes a few minutes." \
            if web_server.needs_install() else ""
        self._web_note(f"Starting the web dashboard… it opens in your browser when it's "
                       f"ready.{first}")
        self._web_starting = True
        self.run_worker(self._start_web, thread=True, group="web", exit_on_error=False)

    def stop_web_dashboard(self) -> None:
        """On quit: stop waiting, and stop the dashboard if this TUI started it."""
        self._web_quit.set()
        if self._web_process is not None:
            web_server.stop(self._web_process)
            self._web_process = None

    # --- in a worker thread ----------------------------------------------------------------
    def _start_web(self) -> None:
        try:
            self._web_note_later(self._launch_and_wait())
        finally:
            self._web_starting = False

    def _launch_and_wait(self) -> Optional[Note]:
        """Install if needed, start it, wait until it answers. Returns what to tell the user."""
        log = web_server.LOG_FILE
        if web_server.needs_install() and not web_server.install():
            return f"Couldn't install the web dashboard's packages. Details: {log}", "error"
        if self._web_quit.is_set():
            return None
        self._web_process = process = web_server.start(persist.DATA_DIR, persist.WEB_URL_FILE)
        waited = 0.0
        while waited < READY_TIMEOUT and not self._web_quit.is_set():
            code = process.poll()
            if code is not None:
                self._web_process = None
                if code == web_server.PORTS_BUSY:
                    return ("Another web dashboard already uses its port on 127.0.0.1 (an older "
                            "one left running?). Stop it, then run /web again. Details: "
                            f"{log}", "error")
                return f"The web dashboard stopped while starting. Details: {log}", "error"
            if web_server.is_listening(store.web_dashboard_url()):
                return ("The web dashboard is ready and opened in your browser. /web opens it "
                        "again.", "information")
            self._web_quit.wait(POLL_EVERY)
            waited += POLL_EVERY
        if self._web_quit.is_set():
            return None
        return f"The web dashboard is taking a while to start. Details: {log}", "warning"

    # --- messages --------------------------------------------------------------------------
    def _open_in_browser(self, url: str) -> None:
        if browser.open_url(url):
            self._web_note("Opening the web dashboard in your browser…")
        else:
            self._web_note(f"Open it in your browser:  {url}", severity="warning")

    def _web_note(self, message: str, severity: str = "information") -> None:
        self.notify(message, title="Web dashboard", severity=severity, markup=False,
                    timeout=10)

    def _web_note_later(self, note: Optional[Note]) -> None:
        if note and not self._web_quit.is_set():
            self.call_from_thread(self._web_note, *note)
