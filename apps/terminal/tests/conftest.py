"""Shared fixtures: every test starts from fresh demo data, and the UI never waits."""

from typing import List

import pytest

from reconix import browser, store, web_server
from reconix.app import ReconixApp
from reconix.flow import RunController
from reconix.store import persist, report


@pytest.fixture(autouse=True)
def fresh_store():
    """The store lists are process-wide, so reset them around every test."""
    store.reset()
    yield
    store.reset()


@pytest.fixture(autouse=True)
def instant_ui(monkeypatch, tmp_path):
    """Steps play at once; reports, saved assessments and the web link live in temp."""
    monkeypatch.setattr(RunController, "SPEED", 0)
    monkeypatch.setattr(report, "REPORTS_DIR", tmp_path / "reports")
    monkeypatch.setattr(persist, "DATA_DIR", tmp_path / "assessments")
    monkeypatch.setattr(persist, "WEB_URL_FILE", tmp_path / "web.url")
    monkeypatch.setattr(persist, "_written", {})


@pytest.fixture(autouse=True)
def knowledge_dir(monkeypatch, tmp_path):
    """Point the /add-on knowledge folder at temp, never ~/.reconix/knowledge."""
    from reconix.store.knowledge import paths

    monkeypatch.setattr(paths, "KNOWLEDGE_DIR", tmp_path / "knowledge")
    monkeypatch.setenv("RECONIX_KNOWLEDGE_KEY_FILE", str(tmp_path / "keys" / "knowledge.key"))


@pytest.fixture
def reports_dir(tmp_path):
    """Where instant_ui sends the reports this test writes."""
    return tmp_path / "reports"


@pytest.fixture(autouse=True)
def opened(monkeypatch) -> List[str]:
    """Nothing a test does may launch a real browser: record what would have opened."""
    calls: List[str] = []
    monkeypatch.setattr(browser, "open_url", lambda url: calls.append(url) or True)
    monkeypatch.setattr(browser, "open_path", lambda path: calls.append(path) or True)
    return calls


class FakeDashboard:
    """Stands in for the `npm run dev` process: running until stopped."""

    def __init__(self) -> None:
        self.stopped = False
        self.pid = -1

    def poll(self):
        return 0 if self.stopped else None


@pytest.fixture(autouse=True)
def web_launches(monkeypatch) -> List[object]:
    """Nothing a test does may start a real web dashboard: record what would have run.

    Each started FakeDashboard is appended; "install" marks an `npm install`. The real
    readiness check is kept (nothing listens, so it never looks ready unless a test says).
    """
    calls: List[object] = []

    def start(data_dir, url_file):
        calls.append(FakeDashboard())
        return calls[-1]

    monkeypatch.setattr(web_server, "install", lambda: calls.append("install") or True)
    monkeypatch.setattr(web_server, "start", start)
    monkeypatch.setattr(web_server, "stop", lambda process: setattr(process, "stopped", True))
    monkeypatch.setattr(web_server, "problem", lambda: "")
    monkeypatch.setattr(web_server, "needs_install", lambda: False)
    return calls


@pytest.fixture
def app() -> ReconixApp:
    return ReconixApp()
