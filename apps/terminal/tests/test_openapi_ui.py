"""The API template's base URL and spec form, from the Template screen's scope review (Pilot)."""

import json

from textual.widgets import Input, Static

from reconix import store
from reconix.screens import TemplateScreen
from reconix.screens import StartScreen
from reconix.screens.forms import OpenApiForm, ScopeEditForm
from reconix.widgets import ChoiceMenu, ScopeManifestView

from .support import SIZE, settle, start_demo, type_request

API_REQUEST = "test the API at https://api.example.com/v1"
SPEC = {
    "openapi": "3.0.3", "info": {"title": "Orders API", "version": "1.2.0"},
    "servers": [{"url": "https://api.example.com/v1"}, {"url": "https://evil.example.net"}],
    "paths": {"/orders": {"get": {}, "post": {}}, "/orders/{id}": {"get": {}}},
}


async def to_api_review(app, pilot) -> None:
    await type_request(pilot, API_REQUEST)
    await settle(pilot, 8)
    if isinstance(app.screen, OpenApiForm):     # the API template auto-offers the spec form
        await pilot.press("escape")             # Cancel = skip; the Scope menu still offers it
        await settle(pilot)
    assert isinstance(app.screen, TemplateScreen) and app.screen.state() == "review"


def choice_labels(app):
    return [c.label for c in app.screen.query_one("#scope-menu", ChoiceMenu)._choices]


async def test_attach_a_spec_from_the_scope_review(app, tmp_path):
    path = tmp_path / "openapi.json"
    path.write_text(json.dumps(SPEC), encoding="utf-8")
    async with app.run_test(size=SIZE) as pilot:
        await to_api_review(app, pilot)
        assert "Attach OpenAPI spec" in choice_labels(app)
        spec_choice = app.screen.query_one("#scope-menu", ChoiceMenu)._choices[1]
        assert spec_choice.hint == (
            "a .json or .yaml OpenAPI 3 / Swagger 2 file or URL; read, never run")
        await pilot.press("2")
        await settle(pilot)
        assert isinstance(app.screen, OpenApiForm)
        field = app.screen.query_one("#spec", Input)
        assert field.placeholder == (
            "~/specs/openapi.yaml or https://api.example.com/openapi.json")
        field.value = str(path)
        app.screen.query_one("#submit").press()
        await settle(pilot, 8)
        assert isinstance(app.screen, TemplateScreen)
        assert store.get_api_spec().total == 3
        shown = str(app.screen.query_one(ScopeManifestView).render())
        assert "API spec  Orders API 1.2.0 · 3 endpoints · GET, POST" in shown
        assert "Out of scope  https://evil.example.net" in shown
        assert "In spec, not allowed" not in shown          # GET and POST are both allowed
        assert "Replace OpenAPI spec" in choice_labels(app)
        assert store.get_scope().target_url == "https://api.example.com"


async def test_a_bad_file_shows_the_store_error_and_keeps_the_form(app, tmp_path):
    path = tmp_path / "notes.json"
    path.write_text(json.dumps({"hello": "world"}), encoding="utf-8")
    async with app.run_test(size=SIZE) as pilot:
        await to_api_review(app, pilot)
        await pilot.press("2")
        await settle(pilot)
        app.screen.query_one("#spec", Input).value = str(path)
        app.screen.query_one("#submit").press()
        await settle(pilot)
        assert isinstance(app.screen, OpenApiForm)
        assert "OpenAPI" in str(app.screen.query_one("#form-error", Static).render())
        assert store.get_api_spec() is None


async def test_api_template_auto_opens_the_spec_form(app, tmp_path):
    path = tmp_path / "openapi.json"
    path.write_text(json.dumps(SPEC), encoding="utf-8")
    async with app.run_test(size=SIZE) as pilot:
        await type_request(pilot, API_REQUEST)
        await settle(pilot, 8)
        assert isinstance(app.screen, OpenApiForm)       # it opens on its own at the API scope
        assert app.screen.query_one("#base_url", Input).value == "https://api.example.com"
        app.screen.query_one("#spec", Input).value = str(path)
        app.screen.query_one("#submit").press()
        await settle(pilot, 8)
        assert isinstance(app.screen, TemplateScreen)
        assert store.get_api_spec().total == 3


async def test_api_template_auto_form_cancel_skips_and_does_not_reopen(app):
    async with app.run_test(size=SIZE) as pilot:
        await type_request(pilot, API_REQUEST)
        await settle(pilot, 8)
        assert isinstance(app.screen, OpenApiForm)
        await pilot.press("escape")                      # Cancel = skip
        await settle(pilot, 4)
        assert isinstance(app.screen, TemplateScreen)    # it does not reopen
        assert store.get_api_spec() is None
        assert "Attach OpenAPI spec" in choice_labels(app)   # still offered in the menu


async def test_other_templates_do_not_auto_open_the_form(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)                          # the demo URL is a Web URL
        assert isinstance(app.screen, TemplateScreen)


async def test_other_templates_do_not_offer_the_choice(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)                         # the demo URL is a Web URL
        assert isinstance(app.screen, TemplateScreen)
        assert not any("OpenAPI" in label for label in choice_labels(app))


async def attach_through_the_form(app, pilot, path) -> None:
    await pilot.press("2")
    await settle(pilot)
    assert isinstance(app.screen, OpenApiForm)
    app.screen.query_one("#spec", Input).value = str(path)
    app.screen.query_one("#submit").press()
    await settle(pilot, 8)
    assert isinstance(app.screen, TemplateScreen)


def write_spec(tmp_path, name, doc):
    path = tmp_path / name
    path.write_text(json.dumps(doc), encoding="utf-8")
    return path


async def test_numbers_on_the_api_review_without_a_spec(app):
    async with app.run_test(size=SIZE) as pilot:
        await to_api_review(app, pilot)
        assert choice_labels(app)[:4] == [
            "Approve scope", "Attach OpenAPI spec", "Edit manifest", "Reject"]
        await pilot.press("3")                           # Edit manifest
        await settle(pilot)
        assert isinstance(app.screen, ScopeEditForm)
        await pilot.press("escape")
        await settle(pilot)
        await pilot.press("4")                           # Reject
        await settle(pilot)
        assert isinstance(app.screen, StartScreen)
        assert not store.get_run().started


async def test_numbers_with_a_spec_and_remove(app, tmp_path):
    spec = dict(SPEC, paths={"/orders": {"get": {}, "delete": {}}})
    path = write_spec(tmp_path, "openapi.json", spec)
    async with app.run_test(size=SIZE) as pilot:
        await to_api_review(app, pilot)
        await attach_through_the_form(app, pilot, path)
        assert choice_labels(app)[:5] == [
            "Approve scope", "Replace OpenAPI spec", "Remove OpenAPI spec",
            "Edit manifest", "Reject"]
        assert store.get_scope().allowed_methods == ["GET"]
        shown = str(app.screen.query_one(ScopeManifestView).render())
        assert "In spec, not allowed  DELETE" in shown
        await pilot.press("3")                           # Remove OpenAPI spec
        await settle(pilot, 8)
        assert store.get_api_spec() is None
        assert store.get_scope().allowed_methods == ["GET", "POST"]
        assert choice_labels(app)[:4] == [
            "Approve scope", "Attach OpenAPI spec", "Edit manifest", "Reject"]


async def test_replace_keeps_the_operators_edit(app, tmp_path):
    path = write_spec(tmp_path, "openapi.json", SPEC)
    async with app.run_test(size=SIZE) as pilot:
        await to_api_review(app, pilot)
        await attach_through_the_form(app, pilot, path)
        store.edit_scope(allowed_methods=["POST"])
        app.reload_screen()
        await settle(pilot, 8)
        await attach_through_the_form(app, pilot, path)  # Replace
        assert store.get_scope().allowed_methods == ["POST"]


async def test_an_unexpected_error_is_a_friendly_form_error(app, tmp_path, monkeypatch):
    def boom(_base_url, _spec):
        raise RuntimeError("boom")

    monkeypatch.setattr(store, "save_api_form", boom)
    async with app.run_test(size=SIZE) as pilot:
        await to_api_review(app, pilot)
        await pilot.press("2")
        await settle(pilot)
        app.screen.query_one("#spec", Input).value = str(tmp_path / "x.json")
        app.screen.query_one("#submit").press()
        await settle(pilot, 8)
        assert isinstance(app.screen, OpenApiForm)
        assert "Couldn't read" in str(app.screen.query_one("#form-error", Static).render())
        assert not app.screen.query_one("#submit").disabled


# --- the form's two fields -------------------------------------------------------------------
async def test_the_form_reads_as_planned(app):
    async with app.run_test(size=SIZE) as pilot:
        await type_request(pilot, API_REQUEST)
        await settle(pilot, 8)
        form = app.screen
        assert isinstance(form, OpenApiForm)
        assert str(form.query_one(".dialog").border_title) == "⇡ API TEMPLATE: BASE URL AND SPEC"
        base = form.query_one("#base_url", Input)
        assert base.value == "https://api.example.com"
        assert base.placeholder == "https://api.example.com"
        labels = [str(label.render()) for label in form.query(".field-label")]
        assert labels == ["API base URL", "OpenAPI spec (optional)"]
        assert str(form.query_one("#submit").label) == "Save"
        shown = " ".join(str(w.render()) for w in form.query(Static))
        assert "The spec is only read, never run, and never widens the scope." in shown
        assert "Leave the spec empty to skip it · Esc to cancel" in shown


async def test_save_with_a_new_base_url_redrafts_the_manifest(app):
    async with app.run_test(size=SIZE) as pilot:
        await type_request(pilot, API_REQUEST)
        await settle(pilot, 8)
        assert isinstance(app.screen, OpenApiForm)
        app.screen.query_one("#base_url", Input).value = "https://orders.example.org"
        app.screen.query_one("#submit").press()
        await settle(pilot, 8)
        assert isinstance(app.screen, TemplateScreen)
        assert store.get_scope().target_url == "https://orders.example.org"
        shown = str(app.screen.query_one(ScopeManifestView).render())
        assert "https://orders.example.org" in shown
        assert store.get_api_spec() is None


async def test_a_foreign_spec_url_is_refused_in_the_form(app):
    async with app.run_test(size=SIZE) as pilot:
        await type_request(pilot, API_REQUEST)
        await settle(pilot, 8)
        form = app.screen
        form.query_one("#spec", Input).value = "https://evil.example.net/openapi.json"
        form.query_one("#submit").press()
        await settle(pilot, 8)
        assert app.screen is form                         # the form stays open
        error = str(form.query_one("#form-error", Static).render())
        assert error == "The spec URL must be on api.example.com."
        assert not form.query_one("#submit").disabled
        assert store.get_api_spec() is None
