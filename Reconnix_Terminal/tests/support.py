"""Helpers shared by the tests: driving the store's run, and driving the UI."""

import io
import time
from typing import Callable, List, Optional

from reconix import store

SIZE = (140, 45)   # fixed terminal size so layout-dependent widgets behave the same

TEST_PASSWORD = "s3cret-Pa55-for-tests"   # must never appear anywhere it is shown or saved

# A bare hostname could be a site, an API or a network host, so the run asks for the
# template. The demo request (a URL) and IPv4/repo/path targets pick theirs themselves.
ASK_REQUEST = "Assess staging.example.com"


def event_kinds() -> List[str]:
    return [event.kind for event in store.list_events()]


# --- the run, straight through the store ---------------------------------------------------
def play_until_gate() -> Optional[str]:
    """Advance the store's run until it waits at a gate (returns it) or ends (None)."""
    while True:
        step = store.advance()
        if step is None:
            return None
        if step.kind == "gate" and store.waiting_gate() == step.name:
            return step.name


def auth_values(challenge) -> dict:
    """Fill a login step: a test account or a cookie, or (the code step) a dummy OTP code."""
    out = {}
    for field in challenge.fields:
        out[field.id] = ("123456" if field.otp
                         else TEST_PASSWORD if field.secret else "demo.tester")
    return out


def decide(gate: str) -> None:
    """Make the human decision a gate waits for, straight through the store."""
    if gate == "template":
        store.select_template(store.get_assessment().template_id)
    elif gate == "scope":
        store.approve_scope()
    elif gate == "plan":
        store.run_plan()
    elif gate in ("account", "code"):
        store.provide_auth(auth_values(store.current_auth_challenge()))
    elif gate.startswith("approval:"):
        request = store.get_approval(gate.split(":", 1)[1])
        if request.risk == "HIGH":
            token = store.request_confirmation(request.request_id, request.command_hash)
            store.approve(request.request_id, command_hash=request.command_hash,
                          confirmation_token=token)
        else:
            store.approve(request.request_id, command_hash=request.command_hash)
    else:
        raise ValueError(gate)


def run_to(target: Optional[str], request: str = store.DEMO_REQUEST) -> None:
    """Start a run and decide every gate until `target` is waiting (None: to the end).

    The demo request skips the template gate (its URL picks Web URL); pass
    `ASK_REQUEST` to stop at "template".
    """
    store.start_run(request)
    while True:
        gate = play_until_gate()
        if gate is None or gate == target:
            return
        decide(gate)


def run_to_end() -> None:
    """Decide every gate of a run that has already started, until it ends."""
    while True:
        gate = play_until_gate()
        if gate is None:
            return
        decide(gate)


# --- driving the UI ------------------------------------------------------------------------
def screen_text(screen) -> str:
    """Everything a screen or dialog shows in its Static widgets, as plain text."""
    from rich.console import Console
    from textual.widgets import Static

    out = []
    for static in screen.query(Static):
        console = Console(file=io.StringIO(), width=120, force_terminal=False)
        console.print(static.content)
        out.append(console.file.getvalue())
    return "\n".join(out)


async def settle(pilot, rounds: int = 4) -> None:
    """Let screen switches, dialogs (pushed on the app's next turn) and redraws land."""
    for _ in range(rounds):
        await pilot.pause()


async def wait_until(pilot, cond: Callable[[], bool], timeout: float = 5.0,
                     what: str = "condition") -> None:
    """Pause the app until `cond()` holds (a worker finished, a gate opened, a line showed up),
    or fail after `timeout` seconds. Replaces fixed `settle(rounds=N)` waits on background work."""
    deadline = time.monotonic() + timeout
    while not cond():
        if time.monotonic() > deadline:
            raise AssertionError(f"timed out after {timeout}s waiting for {what}")
        await pilot.pause(0.05)


async def show(app, pilot, name: str) -> None:
    """Jump straight to a flow screen and let it mount."""
    app.goto(name)
    await settle(pilot)


async def start_demo(pilot) -> None:
    """Enter on the empty Start prompt runs the demo request; it stops at the scope."""
    await pilot.press("enter")
    await settle(pilot)


async def type_request(pilot, text: str) -> None:
    """Type `text` into the prompt on screen and submit it with Enter."""
    from reconix.widgets import PromptBox

    box = pilot.app.screen.query_one(PromptBox)
    box.input.value = text
    box.input.focus()
    await pilot.press("enter")
    await settle(pilot)


async def pass_gate(app, pilot) -> str:
    """Make the decision the run waits for, with the keyboard. Returns the gate."""
    from textual.widgets import Input

    from reconix.screens import ApprovalScreen, ChoiceScreen, PlanScreen, TemplateScreen
    from reconix.screens.forms import LoginForm, OpenApiForm

    gate = store.waiting_gate()
    screen = app.screen
    if isinstance(screen, OpenApiForm):
        # The API template auto-opens its base URL and spec form at the scope gate (two fields,
        # the base URL prefilled); skip it (Cancel) and decide the scope on the review screen
        # underneath.
        await pilot.press("escape")
        await settle(pilot)
        screen = app.screen
    if isinstance(screen, TemplateScreen):
        await pilot.press("1" if gate == "scope" else "enter")   # Approve / the suggestion
    elif isinstance(screen, PlanScreen):
        await pilot.press("1")                                   # Run plan
    elif isinstance(screen, LoginForm):
        for field_id, value in auth_values(store.current_auth_challenge()).items():
            screen.query_one(f"#{field_id}", Input).value = value
        screen.query_one("#submit").press()
    elif isinstance(screen, ApprovalScreen):
        request = store.get_approval(gate.split(":", 1)[1])
        if request.risk == "HIGH":
            await pilot.press("1")                               # Approve & run
            await settle(pilot)
            assert isinstance(app.screen, ChoiceScreen)
            await pilot.press("down", "enter")                   # Yes (No is the default)
        else:
            await pilot.press("1")
    else:
        raise AssertionError(f"no gate is open (screen: {screen!r}, gate: {gate!r})")
    await settle(pilot)
    return gate


async def run_ui_to(app, pilot, target: Optional[str], request: Optional[str] = None) -> None:
    """Start a run and pass gates with the keyboard until `target` is waiting.

    No `request`: Enter on the empty Start prompt runs the demo. Otherwise `request` is typed
    into the Start prompt and submitted.
    """
    if request is None:
        await start_demo(pilot)
    else:
        await type_request(pilot, request)
    while store.waiting_gate() and store.waiting_gate() != target and not store.is_finished():
        await pass_gate(app, pilot)
    assert store.waiting_gate() == (target or "") or (target is None and store.is_finished())


# --- a finding that did not come from the scripted run ---------------------------------------
def add_finding(title: str, path: str = "/x", *, severity: str = "LOW", description: str = "",
                evidence: Optional[List[str]] = None) -> None:
    """Add one revealed finding the way the AI agent does (`AI-NNN`), for tests that need
    odd text in a finding (control bytes, secrets) without a scripted template."""
    from reconix.models import Finding
    from reconix.store.findings import ingest_external

    ingest_external([Finding(
        fid="", severity=severity, title=title, path=path, validation="UNCONFIRMED",
        description=description, affected_url=path, impact="", remediation="", tool="agent",
        evidence=list(evidence or []), category="Web App")])
