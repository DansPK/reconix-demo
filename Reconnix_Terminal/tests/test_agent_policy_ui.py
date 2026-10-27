"""A tool call the scope guard refused shows as a POLICY line in the activity log."""

from reconix import store
from reconix.store import agent_run

from reconix.widgets import RunLog

from .support import SIZE, wait_until


def _log_text(app) -> str:
    """What the Execution screen's live log shows, as plain text."""
    logs = app.screen.query(RunLog)
    return "\n".join(strip.text for log in logs for strip in log.lines)


async def test_refused_tool_call_shows_a_policy_line(app, model_active, monkeypatch):
    async def fake_run(text, on_event, on_ask=None):
        await on_event({"type": "policy", "tool": "http_poc",
                        "reason": "Path outside approved scope",
                        "args": {"method": "GET", "url": "https://staging.example.com/admin"}})

    monkeypatch.setattr(agent_run, "run", fake_run)
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/assess http://target.example")
        await wait_until(pilot, lambda: store.waiting_gate() == "scope", what="the scope gate")
        app.approve_scope()
        await wait_until(pilot, lambda: store.blocked_count() == 1, what="the blocked verdict")

        entry = store.list_activity()[-1]
        assert (entry.source, entry.tone) == ("POLICY", "block")
        assert "Path outside approved scope" in entry.message
        await wait_until(pilot, lambda: "Path outside approved scope" in _log_text(app),
                         what="the POLICY line in the activity log")
        row = next(line for line in _log_text(app).splitlines()
                   if "Path outside approved scope" in line)
        assert "policy" in row.split("Blocked")[0]      # the who column, before the message
