"""Plays the assessment run: one store step at a time, pausing at gates.

The controller holds no data. It asks the store for the next step, tells its host
(the dashboard) to redraw, and when the store says the run waits at a gate it asks
the host to open that gate's dialog. With the backend wired, `advance()` becomes the
server's event stream and this class stays the same.
"""

from typing import Optional, Protocol

from textual.timer import Timer

from .. import store


class RunHost(Protocol):
    """What the controller needs from the screen that hosts the run."""

    def refresh_view(self) -> None: ...
    def open_gate(self, gate: str) -> None: ...
    def run_finished(self) -> None: ...
    def run_failed(self, message: str) -> None: ...
    def set_timer(self, delay: float, callback) -> Timer: ...


class RunController:
    SPEED = 1.0   # multiplies each step's pause; 0 plays instantly (tests)

    def __init__(self, host: RunHost) -> None:
        self._host = host
        self._timer: Optional[Timer] = None

    @property
    def busy(self) -> bool:
        """True while steps are scheduled to play."""
        return self._timer is not None

    def resume(self) -> None:
        """Play on from where the run is (after a start or a gate decision)."""
        if self._timer is None:
            self._schedule()

    def stop(self) -> None:
        if self._timer is not None:
            self._timer.stop()
            self._timer = None

    def _schedule(self) -> None:
        step = store.peek()
        if step is None:
            self._timer = None
            return
        delay = step.pause * self.SPEED
        if delay <= 0:
            self._play()
        else:
            self._timer = self._host.set_timer(delay, self._play)

    def _play(self) -> None:
        # Instant steps play in a loop (not by recursion) until a pause, a gate or the end.
        while True:
            self._timer = None
            try:
                step = store.advance()
            except store.StoreValidationError as exc:
                # A step the store refuses stops playback; it never crashes the app.
                self._host.refresh_view()
                self._host.run_failed(str(exc))
                return
            self._host.refresh_view()
            if step is None:
                if store.is_finished():
                    self._host.run_finished()
                return
            if step.kind == "gate" and store.waiting_gate() == step.name:
                self._host.open_gate(step.name)
                return
            upcoming = store.peek()
            if upcoming is None:
                if store.is_finished():
                    self._host.run_finished()
                return
            delay = upcoming.pause * self.SPEED
            if delay > 0:
                self._timer = self._host.set_timer(delay, self._play)
                return
