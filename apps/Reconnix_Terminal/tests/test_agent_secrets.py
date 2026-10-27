"""Secrets in an agent's tool calls never reach the activity log, the audit trail or the
saved copy; a cancelled turn drops its Agent (no dangling tool calls in its history)."""

import json

from reconix import store
from reconix.store import agent_run, lists
from reconix.store.snapshot import snapshot

from .support import TEST_PASSWORD, run_to


def _everything_saved() -> str:
    """What the activity log, chat, audit trail, verdicts and the saved copy hold."""
    parts = [json.dumps(snapshot(store.get_assessment()), default=str)]
    parts += [a.message for a in store.list_activity()]
    parts += [c.text for c in store.list_chat()]
    parts += [f"{e.kind} {e.detail}" for e in store.list_events()]
    parts += [f"{v.method} {v.path} {v.reason}" for v in store.list_verdicts()]
    return "\n".join(parts)


def test_tool_arguments_and_results_are_masked_before_they_are_logged():
    run_to("plan")
    secret = TEST_PASSWORD
    events = [
        {"type": "tool_start", "name": "http_poc", "args": {
            "method": "POST", "url": f"https://u:{secret}@staging.example.com/x",
            "headers": {"Authorization": f"Bearer {secret}", "X-Custom": secret,
                        "Cookie": f"session={secret}"},
            "body": f"password={secret}"}},
        {"type": "tool_start", "name": "login", "args": {
            "url": "https://staging.example.com/login", "username": "demo",
            "password": secret}},
        {"type": "tool_end", "name": "login", "result": {
            "ok": True, "token": secret, "cookie": f"sid={secret}",
            "header": f"Authorization: Bearer {secret}"}},
        {"type": "tool_start", "name": "run_scan", "args": {
            "target": "shop", "options": {"nikto": f"-id demo:{secret}"}}},
        {"type": "tool_progress", "text": f"sending password: {secret}"},
        {"type": "policy", "tool": "http_poc", "reason": f"bad password={secret}",
         "args": {"method": "GET", "url": f"https://staging.example.com/a?token={secret}"}},
    ]
    for ev in events:
        agent_run.record_event(ev)
    assert TEST_PASSWORD not in _everything_saved()
    assert any("http_poc(" in a.message for a in store.list_activity())   # still logged


def test_mask_secrets_keeps_header_names_and_plain_values():
    masked = agent_run.mask_secrets({"url": "https://x.example/a", "headers": {"X-A": "1"},
                                     "Tools": ["nmap"], "n": 3})
    assert masked["url"] == "https://x.example/a" and masked["Tools"] == ["nmap"]
    assert masked["headers"] == {"X-A": agent_run.MASK} and masked["n"] == 3


def test_a_refused_run_scan_is_audited_with_its_tools_and_host():
    run_to("plan")
    agent_run.record_event({"type": "policy", "tool": "run_scan", "reason": "Host outside",
                            "args": {"target": "http://evil.example.net", "tools": ["nmap"]}})
    verdict = store.list_verdicts()[-1]
    assert (verdict.method, verdict.path) == ("SCAN", "nmap http://evil.example.net")


def test_plan_labels_are_masked_before_they_are_cut():
    """A credential URL longer than the label cut must not leave a password prefix behind."""
    run_to("account")
    secret_url = f"https://administrator:{TEST_PASSWORD}@app.example.com/login"
    agent_run.set_plan([{"text": f"Scan the login at {secret_url}", "status": "pending"}])
    labels = [task.label for task in lists.current().plan]
    assert labels and all(TEST_PASSWORD[:8] not in label for label in labels)
    assert "••••" in labels[0]
