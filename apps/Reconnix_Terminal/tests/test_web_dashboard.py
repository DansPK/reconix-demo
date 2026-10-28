"""/web starts the web dashboard when it isn't running (no `cd web && npm run dev`)."""

import socket
import sys

from reconix import web_server
from reconix.shell import web as web_shell
from reconix.web_server import needs_install as real_needs_install
from reconix.web_server import problem as real_problem     # before conftest stubs it
from reconix.web_server import start as real_start

from .support import SIZE, settle


def _notes(app) -> str:
    return " ".join(str(n.message) for n in app._notifications)


async def test_the_first_web_starts_it_and_a_second_waits(app, opened, web_launches):
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/web")
        app.run_command_line("/web")                       # again, while it starts
        await settle(pilot)
        assert len(web_launches) == 1 and opened == []
        assert "Starting the web dashboard" in _notes(app)
        assert "still starting" in _notes(app)


async def test_it_says_when_it_is_ready(app, web_launches, monkeypatch):
    monkeypatch.setattr(web_shell, "POLL_EVERY", 0.01)
    # Nothing listens on the dashboard port before start; the poll then finds it ready.
    calls = {"n": 0}

    def listening(url):
        calls["n"] += 1
        return calls["n"] > 1

    monkeypatch.setattr(web_server, "is_listening", listening)
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/web")
        await app.workers.wait_for_complete()
        await settle(pilot)
        assert "ready and opened in your browser" in _notes(app)
        assert not app._web_starting


async def test_it_says_when_another_dashboard_holds_the_port(app, web_launches, monkeypatch):
    class Busy:                                            # serve.mjs found its ports taken
        pid = -1

        def poll(self):
            return web_server.PORTS_BUSY

    monkeypatch.setattr(web_shell, "POLL_EVERY", 0.01)
    monkeypatch.setattr(web_server, "start", lambda data_dir, url_file: Busy())
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/web")
        await app.workers.wait_for_complete()
        await settle(pilot)
        assert "Another web dashboard already uses its port" in _notes(app)
        assert app._web_process is None and not app._web_starting


async def test_the_first_time_it_installs_the_packages_first(app, web_launches, monkeypatch):
    monkeypatch.setattr(web_server, "needs_install", lambda: True)
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/web")
        await settle(pilot)
        assert web_launches[0] == "install" and len(web_launches) == 2
        assert "installing its packages" in _notes(app)


async def test_without_node_it_says_how_to_start_it(app, web_launches, monkeypatch):
    monkeypatch.setattr(web_server, "problem", lambda: "The web dashboard needs Node.js.")
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/web")
        await settle(pilot)
        assert web_launches == []
        assert "Node.js" in _notes(app) and "cd web && npm run dev" in _notes(app)


async def test_a_dashboard_it_started_stops_when_the_tui_quits(app, web_launches):
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/web")
        await settle(pilot)
        [dashboard] = web_launches
        assert not dashboard.stopped
    assert dashboard.stopped


def test_a_newly_added_package_triggers_an_install(monkeypatch, tmp_path):
    (tmp_path / "package.json").write_text('{"dependencies": {"next": "1", "gsap": "3"}}')
    (tmp_path / "node_modules" / "next").mkdir(parents=True)
    (tmp_path / "node_modules" / "next" / "package.json").write_text("{}")
    monkeypatch.setattr(web_server, "WEB_DIR", tmp_path)
    assert real_needs_install()                         # gsap is missing
    (tmp_path / "node_modules" / "gsap").mkdir(parents=True)
    (tmp_path / "node_modules" / "gsap" / "package.json").write_text("{}")
    assert not real_needs_install()


def test_its_log_is_private(monkeypatch, tmp_path):
    log = tmp_path / "web.log"
    log.write_text("old\n")
    log.chmod(0o644)                                     # from before: tightened
    monkeypatch.setattr(web_server, "LOG_FILE", log)
    with web_server._log() as out:
        out.write(b"new\n")
    assert (log.stat().st_mode & 0o777) == 0o600 and log.read_text() == "old\nnew\n"


def test_the_dashboard_runs_its_knowledge_cli_with_this_python(monkeypatch, tmp_path):
    seen = {}

    class Popen:
        def __init__(self, args, **kwargs):
            seen.update(kwargs["env"])

    monkeypatch.setattr(web_server.subprocess, "Popen", Popen)
    monkeypatch.setattr(web_server, "LOG_FILE", tmp_path / "web.log")
    real_start(tmp_path / "data", tmp_path / "web.url")
    assert seen["RECONIX_PYTHON"] == sys.executable


async def test_nothing_listening_starts_it_and_opens_nothing_yet(app, opened, web_launches,
                                                                 monkeypatch):
    monkeypatch.setattr(web_server, "is_listening", lambda url: False)
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/web")
        await settle(pilot)
        assert opened == [] and len(web_launches) == 1


def test_is_listening_needs_something_on_the_port():
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        server.listen()
        port = server.getsockname()[1]
        assert web_server.is_listening(f"http://127.0.0.1:{port}/login#token=x")
    assert not web_server.is_listening(f"http://127.0.0.1:{port}/login")
    assert not web_server.is_listening(None)


def test_it_cant_start_without_the_web_folder(monkeypatch, tmp_path):
    monkeypatch.setattr(web_server, "WEB_DIR", tmp_path)
    assert "web/" in real_problem()
