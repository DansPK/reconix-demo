"""Saving assessments for the web dashboard: when, where, what, and never a secret."""

import json
import os
import stat

from reconix import store
from reconix.store import lists, persist, snapshot

from .support import SIZE, TEST_PASSWORD, decide, play_until_gate, run_to, run_ui_to

OTP_CODE = "741852"


def saved_files():
    return sorted(persist.DATA_DIR.glob("*.json")) if persist.DATA_DIR.exists() else []


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_nothing_is_saved_before_a_run_starts():
    assert store.autosave() is True
    assert saved_files() == []


def test_a_started_run_is_saved_with_its_waiting_gate():
    run_to("scope")
    assert store.autosave() is True
    [path] = saved_files()
    data = load(path)
    assert path.name == f"{lists.SESSION_ID}_{data['label']}.json"
    assert data["schema"] == snapshot.SCHEMA
    assert data["uid"] == path.stem
    assert data["status"] == "Awaiting input"
    assert data["waiting_for"] == "scope approval"
    assert data["template"]["name"] == "Web URL" and data["template"]["confirmed"]
    assert data["scope"]["status"] == "DRAFT"
    assert data["findings"] == []
    assert "saved_at" in data


def test_a_finished_run_has_findings_decisions_verdicts_and_plan():
    run_to(None)
    store.autosave()
    data = load(saved_files()[0])
    assert data["status"] == "Completed"
    assert data["waiting_for"] == ""
    assert len(data["findings"]) == len(store.list_findings()) > 0
    assert [f["severity"] for f in data["findings"]] == [f.severity for f in store.list_findings()]
    assert {d["decision"] for d in data["decisions"]} == {"APPROVED"}
    assert any(not v["allowed"] for v in data["verdicts"])
    assert [t["status"] for t in data["plan"]][:4] == ["done"] * 4
    assert data["login"] == {"kind": "password+otp", "provided": True}
    seqs = [row["seq"] for row in data["timeline"]]
    assert seqs == sorted(seqs) and len(seqs) > 10


def test_a_pending_high_approval_is_named():
    store.start_run(store.DEMO_REQUEST)
    while True:
        gate = play_until_gate()
        if gate.startswith("approval:") and store.get_approval(gate.split(":")[1]).risk == "HIGH":
            break
        decide(gate)
    store.autosave()
    data = load(saved_files()[0])
    assert data["waiting_for"] == "HIGH approval for limited_validation"


def test_no_secret_reaches_the_saved_file():
    store.start_run(store.DEMO_REQUEST)
    tokens = []
    while True:
        gate = play_until_gate()
        if gate is None:
            break
        if gate == "account":
            store.provide_auth({"identity": "demo.tester", "secret": TEST_PASSWORD})
        elif gate == "code":
            store.provide_auth({"code": OTP_CODE})
        elif gate.startswith("approval:"):
            request = store.get_approval(gate.split(":", 1)[1])
            if request.risk == "HIGH":
                token = store.request_confirmation(request.request_id, request.command_hash)
                tokens.append(token)
                store.approve(request.request_id, command_hash=request.command_hash,
                              confirmation_token=token)
            else:
                store.approve(request.request_id, command_hash=request.command_hash)
        else:
            decide(gate)
        store.autosave()
    text = saved_files()[0].read_text(encoding="utf-8")
    for secret in (TEST_PASSWORD, OTP_CODE, "demo.tester", *tokens):
        assert secret not in text


def test_unchanged_content_is_not_rewritten():
    run_to("scope")
    store.autosave()
    [path] = saved_files()
    first = path.stat().st_mtime_ns, path.read_text()
    store.autosave()
    assert (path.stat().st_mtime_ns, path.read_text()) == first
    store.approve_scope()
    store.autosave()
    assert path.read_text() != first[1]


def test_files_are_private():
    run_to("scope")
    store.autosave()
    [path] = saved_files()
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert stat.S_IMODE(persist.DATA_DIR.stat().st_mode) == 0o700
    assert not [p for p in persist.DATA_DIR.iterdir() if p.name.endswith(".tmp")]


def test_folders_it_creates_are_private_too(monkeypatch, tmp_path):
    monkeypatch.setattr(persist, "DATA_DIR", tmp_path / "home" / ".reconix" / "assessments")
    run_to("scope")
    store.autosave()
    assert stat.S_IMODE((tmp_path / "home" / ".reconix").stat().st_mode) == 0o700


def test_each_assessment_gets_its_own_file():
    run_to("scope")
    store.autosave()
    store.new_assessment()
    store.start_run("Assess api.example.com/v1 for API security issues.")
    play_until_gate()
    store.autosave()
    files = saved_files()
    assert len(files) == 2
    assert {load(p)["label"] for p in files} == {"RCX-DEMO-001", "RCX-DEMO-002"}


def test_saving_can_be_turned_off(monkeypatch):
    monkeypatch.setattr(persist, "ENABLED", False)
    run_to("scope")
    assert store.autosave() is True
    assert saved_files() == []


def test_a_failed_write_is_reported_not_raised(monkeypatch, tmp_path):
    blocker = tmp_path / "not-a-folder"
    blocker.write_text("x")
    monkeypatch.setattr(persist, "DATA_DIR", blocker / "assessments")
    run_to("scope")
    assert store.autosave() is False


async def test_the_app_saves_as_the_run_moves(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "scope")
        [path] = saved_files()
        assert load(path)["waiting_for"] == "scope approval"
    assert os.path.exists(path)


def test_a_decided_gate_is_not_reported_as_waiting():
    """approve() leaves `waiting_gate` set until the next step plays; the copy must not."""
    store.start_run(store.DEMO_REQUEST)
    while True:
        gate = play_until_gate()
        if gate.startswith("approval:"):
            break
        decide(gate)
    request_id = gate.split(":", 1)[1]
    store.autosave()
    data = load(saved_files()[0])
    assert data["status"] == "Awaiting input"
    assert data["waiting_request_id"] == request_id
    decide(gate)                                  # decided, but not advanced yet
    assert store.waiting_gate() == gate
    store.autosave()
    data = load(saved_files()[0])
    assert data["status"] == "Running"
    assert (data["waiting_for"], data["waiting_gate"], data["waiting_request_id"]) == ("", "", "")


def test_leaving_an_assessment_saves_it_first():
    run_to("scope")
    lists.current().run.requests = 999            # a change no redraw has saved yet
    store.new_assessment()
    first = [p for p in saved_files() if "RCX-DEMO-001" in p.name][0]
    assert load(first)["run"]["requests"] == 999


def test_a_deleted_file_is_written_again():
    run_to("scope")
    store.autosave()
    [path] = saved_files()
    path.unlink()
    store.autosave()
    assert path.exists()


def test_closing_the_session_marks_every_started_assessment():
    run_to("scope")
    store.new_assessment()
    store.start_run("Assess api.example.com/v1 for API security issues.")
    play_until_gate()
    assert store.close_session() is True
    assert all(load(p)["session_closed"] for p in saved_files())
    assert len(saved_files()) == 2


async def test_quitting_the_app_closes_the_session(app):
    async with app.run_test(size=SIZE) as pilot:
        await run_ui_to(app, pilot, "scope")
        assert load(saved_files()[0])["session_closed"] is False
    assert load(saved_files()[0])["session_closed"] is True


def test_a_folder_others_can_write_is_tightened(tmp_path, monkeypatch):
    folder = tmp_path / "shared"
    folder.mkdir(mode=0o777)
    os.chmod(folder, 0o777)
    monkeypatch.setattr(persist, "DATA_DIR", folder)
    run_to("scope")
    assert store.autosave() is True
    assert stat.S_IMODE(folder.stat().st_mode) == 0o700


def test_a_planted_symlink_is_never_followed(tmp_path, monkeypatch):
    run_to("scope")
    store.autosave()
    [path] = saved_files()
    victim = tmp_path / "victim.txt"
    victim.write_text("keep me")
    for guess in (f".{path.name}.{os.getpid()}.tmp", f".{path.name}.tmp"):
        (persist.DATA_DIR / guess).symlink_to(victim)
    store.approve_scope()
    assert store.autosave() is True
    assert victim.read_text() == "keep me"


def test_web_dashboard_url_is_a_tokenless_loopback_url(monkeypatch):
    monkeypatch.delenv("RECONIX_WEB_PORT", raising=False)
    assert store.web_dashboard_url() == "http://127.0.0.1:3100/"   # no sign-in, default port
    monkeypatch.setenv("RECONIX_WEB_PORT", "4200")
    assert store.web_dashboard_url() == "http://127.0.0.1:4200/"
