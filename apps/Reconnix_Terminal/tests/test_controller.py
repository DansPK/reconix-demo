"""RunController timing (with a fake host) and gates that arrive while a dialog is open."""

from typing import Callable, List

from reconix import store
from reconix.flow import RunController
from reconix.screens import ChoiceScreen, StartScreen, TemplateScreen
from reconix.widgets import PromptBox

from .support import ASK_REQUEST, SIZE, settle, wait_until


class FakeHost:
    """Records what the controller asks for; timers fire only when the test says so."""

    def __init__(self) -> None:
        self.gates: List[str] = []
        self.timers: List[Callable[[], None]] = []
        self.finished = 0
        self.failures: List[str] = []

    def refresh_view(self) -> None:
        pass

    def open_gate(self, gate: str) -> None:
        self.gates.append(gate)

    def run_finished(self) -> None:
        self.finished += 1

    def run_failed(self, message: str) -> None:
        self.failures.append(message)

    def set_timer(self, delay, callback):
        self.timers.append(callback)
        return _Timer()

    def fire(self) -> None:
        callback = self.timers.pop(0)
        callback()


class _Timer:
    def stop(self) -> None:
        pass


def test_steps_wait_for_their_timers_and_stop_at_the_gate(monkeypatch):
    monkeypatch.setattr(RunController, "SPEED", 1.0)
    host = FakeHost()
    controller = RunController(host)
    store.start_run(store.DEMO_REQUEST)
    controller.resume()
    assert controller.busy and not host.gates
    while host.timers:
        host.fire()
    assert host.gates == ["scope"]                    # the URL picked the template itself
    assert not controller.busy


def test_a_store_error_stops_playback_without_crashing(monkeypatch):
    def broken():
        raise store.StoreValidationError("backend said no")
    monkeypatch.setattr(store, "advance", broken)
    host = FakeHost()
    store.start_run(store.DEMO_REQUEST)
    RunController(host).resume()
    assert host.failures == ["backend said no"]


async def test_a_gate_that_arrives_under_another_dialog_opens_after_it(app, monkeypatch):
    monkeypatch.setattr(RunController, "SPEED", 0.4)    # ~1.2 s to the template gate
    async with app.run_test(size=SIZE) as pilot:
        app.screen.query_one(PromptBox).input.value = ASK_REQUEST
        await pilot.press("enter")                     # start (asks for a template) …
        app.show_audit()                               # … then look at the audit trail
        await settle(pilot)
        assert store.waiting_gate() == ""              # the gate hasn't arrived yet
        await wait_until(pilot, lambda: store.waiting_gate() == "template", 6,
                         "the template gate to arrive")
        assert isinstance(app.screen, ChoiceScreen)    # still on top: nothing pulled away
        await pilot.press("escape")
        await settle(pilot)
        assert isinstance(app.screen, TemplateScreen)
        assert app.screen.state() == "choose"
        await pilot.press("enter")                     # the suggestion (Web URL)
        await wait_until(pilot, lambda: store.waiting_gate() == "scope", 6,
                         "the scope gate after the template")
        await settle(pilot)
        # The decided gate never comes back; the next one shows.
        assert isinstance(app.screen, TemplateScreen)
        assert app.screen.state() == "review"
        assert len(app.screen_stack) == 2


async def test_new_closes_dialogs_and_starts_over(app):
    async with app.run_test(size=SIZE) as pilot:
        await pilot.press("enter")
        await settle(pilot)
        app.show_audit()
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen)
        app.new_assessment()
        await settle(pilot)
        assert len(app.screen_stack) == 2
        assert isinstance(app.screen, StartScreen)
        assert not store.get_run().started
