"""/add-on in the UI (Pilot): the menu, the form (busy while the worker reads), the errors, a
direct add and its notices, the removes, and an unreadable index."""

import threading

import pytest
from textual.widgets import Input, Static

from reconix import store
from reconix.screens import ChoiceScreen
from reconix.screens.forms import AddOnForm

from .support import SIZE, settle, wait_until


def _write(tmp_path, name="runbook.md"):
    p = tmp_path / name
    p.write_text("SQL injection reference material for the staging engagement.")
    return p


async def test_add_on_opens_the_menu_when_empty(app):
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/add-on")
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen)
        ids = [c.id for c in app.screen._choices]
        assert ids == ["add"]                          # only "Add a file…" when nothing saved


async def test_menu_lists_sources_and_remove_all(app, tmp_path):
    source = store.add_source(str(_write(tmp_path)))
    async with app.run_test(size=SIZE) as pilot:
        app.open_add_on_menu()
        await settle(pilot)
        ids = [c.id for c in app.screen._choices]
        assert ids[0] == "add" and source.id in ids and "__clear_all__" in ids


async def test_add_via_the_form(app, tmp_path):
    p = _write(tmp_path)
    async with app.run_test(size=SIZE) as pilot:
        app.open_add_on_menu()
        await settle(pilot)
        app.screen.dismiss("add")                      # pick "Add a file…"
        await settle(pilot)
        assert isinstance(app.screen, AddOnForm)
        app.screen.query_one("#path", Input).value = str(p)
        app.screen.query_one("#submit").press()
        await wait_until(pilot, lambda: not isinstance(app.screen, AddOnForm), what="closed")
        assert [s.name for s in store.list_sources()] == ["runbook.md"]


def _error_text(form) -> str:
    return str(form.query_one("#form-error", Static).render())


async def test_form_error_keeps_it_open(app, tmp_path):
    async with app.run_test(size=SIZE) as pilot:
        app.open_dialog(AddOnForm())
        await settle(pilot)
        form = app.screen
        form.query_one("#path", Input).value = str(tmp_path / "missing.txt")
        form.query_one("#submit").press()
        await wait_until(pilot, lambda: "No file at that path" in _error_text(form),
                         what="the refusal under the field")
        assert app.screen is form and not form.is_busy  # the store refused; the form stays
        assert not form.query_one("#submit").disabled
        assert store.list_sources() == []


# --- the form reads the file in the /add-on worker, busy meanwhile -------------------------
async def test_the_form_is_busy_while_the_worker_reads(app, tmp_path, monkeypatch):
    p = _write(tmp_path)
    release = threading.Event()
    calls = []
    real = store.add_source

    def slow_add(path):
        calls.append(threading.current_thread() is threading.main_thread())
        release.wait(5)
        return real(path)

    monkeypatch.setattr(store, "add_source", slow_add)
    async with app.run_test(size=SIZE) as pilot:
        app.open_dialog(AddOnForm())
        await settle(pilot)
        form = app.screen
        form.query_one("#path", Input).value = str(p)
        form.query_one("#submit").press()
        await wait_until(pilot, lambda: calls, what="the worker started")
        assert calls == [False]                        # off the UI thread
        assert form.is_busy and form.query_one("#submit").disabled
        assert form.query_one("#path", Input).disabled
        assert "Reading the file" in _error_text(form)
        form._submit()                                 # a second Add while busy is ignored
        release.set()
        await wait_until(pilot, lambda: app.screen is not form, what="the form closed")
        assert len(calls) == 1 and [s.name for s in store.list_sources()] == ["runbook.md"]


async def test_an_unexpected_failure_goes_to_the_form_not_a_crash(app, tmp_path, monkeypatch):
    def broken(path):
        raise RuntimeError("a parser bug")

    monkeypatch.setattr(store, "add_source", broken)
    async with app.run_test(size=SIZE) as pilot:
        app.open_dialog(AddOnForm())
        await settle(pilot)
        form = app.screen
        form.query_one("#path", Input).value = str(_write(tmp_path))
        form.query_one("#submit").press()
        await wait_until(pilot, lambda: "Couldn't add that file" in _error_text(form),
                         what="the failure under the field")
        assert app.is_running and app.screen is form and not form.is_busy


# --- /add-on <path>: every outcome is a notification ---------------------------------------
@pytest.fixture
def notes(app, monkeypatch):
    seen = []
    monkeypatch.setattr(app, "notify", lambda message, **kw: seen.append((message, kw)))
    return seen


async def test_a_direct_add_that_is_refused_says_why(app, notes, tmp_path):
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line(f"/add-on {tmp_path / 'missing.txt'}")
        await wait_until(pilot, lambda: notes, what="a notification")
        assert notes == [("No file at that path.",
                          {"title": "Add-on", "severity": "warning", "markup": False})]


async def test_a_direct_add_that_crashes_is_reported(app, notes, tmp_path, monkeypatch):
    def broken(path):
        raise MemoryError()

    monkeypatch.setattr(store, "add_source", broken)
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line(f"/add-on {_write(tmp_path)}")
        await wait_until(pilot, lambda: notes, what="a notification")
        assert notes[0][0] == "Couldn't add that file; nothing was saved."
        assert app.is_running


async def test_the_notice_says_when_the_file_was_cut(app, notes, tmp_path, monkeypatch):
    import sys

    monkeypatch.setattr(sys.modules["reconix.store.knowledge.chunk"], "MAX_PASSAGES", 5)
    p = tmp_path / "big.txt"
    p.write_text("\n\n".join(f"paragraph {i} " + "word " * 300 for i in range(20)))
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line(f"/add-on {p}")
        await wait_until(pilot, lambda: notes, what="a notification")
        assert notes[0][0] == "Added big.txt — 5 passage(s), cut to the first 5 passages."


async def test_notice_never_names_a_remote_model(app, notes, tmp_path):
    # Static demo: there is no model, so a file's passages are never sent anywhere.
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line(f"/add-on {_write(tmp_path)}")
        await wait_until(pilot, lambda: notes, what="a notification")
        assert notes[0][0] == "Added runbook.md — 1 passage(s)."


# --- an unreadable index: the menu still opens, with only "Remove all" ---------------------
async def test_a_corrupt_index_still_offers_remove_all(app, tmp_path):
    from reconix.store.knowledge import files, paths

    for name in ("a.txt", "b.txt"):
        store.add_source(str(_write(tmp_path, name)))
    files.index_path().write_text("{ this is not json", encoding="utf-8")
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line("/add-on")
        await settle(pilot)
        menu = app.screen
        assert isinstance(menu, ChoiceScreen) and menu._danger and menu._default == 0
        assert [c.id for c in menu._choices] == ["keep", "__clear_all__"]
        menu.dismiss("__clear_all__")
        await settle(pilot)
        assert list(paths.knowledge_dir().glob("*.json")) == []
        assert store.list_sources() == []


async def test_add_on_with_a_path_adds_directly(app, tmp_path):
    p = _write(tmp_path)
    async with app.run_test(size=SIZE) as pilot:
        app.run_command_line(f"/add-on {p}")
        await wait_until(pilot, lambda: len(store.list_sources()) == 1, what="the add-on added")
        assert store.list_sources()[0].name == "runbook.md"


async def test_remove_confirm_defaults_to_no(app, tmp_path):
    source = store.add_source(str(_write(tmp_path)))
    async with app.run_test(size=SIZE) as pilot:
        app.open_add_on_menu()
        await settle(pilot)
        app.screen.dismiss(source.id)                  # pick the source → remove confirm
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen) and app.screen._danger
        assert app.screen._default == 0                # "No, keep it" is the default
        await pilot.press("enter")                     # the safe default
        await settle(pilot)
        assert [s.id for s in store.list_sources()] == [source.id]   # still there


async def test_remove_confirm_removes(app, tmp_path):
    source = store.add_source(str(_write(tmp_path)))
    async with app.run_test(size=SIZE) as pilot:
        app.open_add_on_menu()
        await settle(pilot)
        app.screen.dismiss(source.id)
        await settle(pilot)
        app.screen.dismiss("remove")
        await settle(pilot)
        assert store.list_sources() == []


async def test_remove_all(app, tmp_path):
    for name in ("a.txt", "b.txt"):
        store.add_source(str(_write(tmp_path, name)))
    async with app.run_test(size=SIZE) as pilot:
        app.open_add_on_menu()
        await settle(pilot)
        app.screen.dismiss("__clear_all__")            # pick "Remove all" → confirm
        await settle(pilot)
        assert isinstance(app.screen, ChoiceScreen) and app.screen._danger
        app.screen.dismiss("clear")
        await settle(pilot)
        assert store.list_sources() == []
