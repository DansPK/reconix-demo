"""The API template's form in the store: the base URL re-drafts the scope; a spec URL is one
download from the API's own host (a local test server, never the real network)."""

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from reconix import store
from reconix.store import openapi_fetch

from .support import TEST_PASSWORD, run_to

API_REQUEST = "test the API at https://api.example.com/v1"
SPEC = {
    "openapi": "3.0.3", "info": {"title": "Orders API", "version": "1.2.0"},
    "servers": [{"url": "/v1"}],
    "paths": {"/orders": {"get": {}, "post": {}}, "/orders/{id}": {"get": {}}},
}
BIG = 5 * 1024 * 1024 + 1


class _Handler(BaseHTTPRequestHandler):
    """Routes for the fetch tests; every request path is recorded (with its query)."""

    seen: list = []

    def log_message(self, *args) -> None:       # quiet
        pass

    def _send(self, body: bytes, kind: str = "application/json", length: bool = True) -> None:
        self.send_response(200)
        self.send_header("Content-Type", kind)
        if length:
            self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 - the http.server API
        _Handler.seen.append(self.path)
        route = self.path.split("?", 1)[0]
        if route == "/openapi.json":
            self._send(json.dumps(SPEC).encode())
        elif route == "/openapi":                                    # YAML, no extension
            self._send(b"openapi: 3.0.3\ninfo: {title: Y, version: '1'}\n"
                       b"paths:\n  /y:\n    get: {}\n", kind="application/yaml")
        elif route == "/big.json":                                   # declared too large
            self.send_response(200)
            self.send_header("Content-Length", str(BIG))
            self.end_headers()
        elif route == "/stream.json":                                # no length, too large
            self.send_response(200)
            self.end_headers()
            try:
                for _ in range(BIG // (64 * 1024) + 2):
                    self.wfile.write(b" " * 64 * 1024)
            except OSError:
                pass
        elif route == "/redirect.json":
            self.send_response(302)
            self.send_header("Location", "/openapi.json")
            self.send_header("Content-Length", "0")
            self.end_headers()
        elif route == "/slow.json":
            time.sleep(1.5)
            self._send(json.dumps(SPEC).encode())
        elif route == "/page.json":
            self._send(b"<html><body>Not a spec</body></html>", kind="text/html")
        else:
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()


@pytest.fixture
def server():
    _Handler.seen = []
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    httpd.daemon_threads = True
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()
    httpd.server_close()


@pytest.fixture
def no_network(monkeypatch):
    def refuse(*_args, **_kwargs):
        raise AssertionError("no download may start")

    monkeypatch.setattr(openapi_fetch, "_opener", refuse)


def api_scope(request: str = API_REQUEST) -> None:
    run_to("scope", request)
    assert store.get_scope().kind == "api"


# --- the base URL ---------------------------------------------------------------------------
def test_an_empty_spec_keeps_only_the_base_url():
    api_scope()
    result = store.save_api_form("https://api.example.com", "")
    assert not result.target_changed and result.spec is None
    assert store.get_scope().target_url == "https://api.example.com"
    assert "scope.retargeted" not in [e.kind for e in store.list_events()]


def test_a_new_base_url_re_drafts_the_scope():
    api_scope()
    store.edit_scope(allowed_methods=["GET"])
    result = store.save_api_form("https://orders.example.org/v2", "")
    assert result.target_changed and result.target_url == "https://orders.example.org"
    scope = store.get_scope()
    assert scope.target_url == "https://orders.example.org" and scope.status != "APPROVED"
    assert scope.allowed_methods == ["GET"]                    # the operator's draft stays
    assessment = store.get_assessment()
    assert assessment.target == "orders.example.org"
    assert all("api.example.com" not in f.affected_url for f in assessment.findings)
    events = store.list_events()
    assert ("scope.retargeted", "https://api.example.com -> https://orders.example.org") in [
        (e.kind, e.detail) for e in events]
    assert store.waiting_gate() == "scope"


def test_a_bad_base_url_changes_nothing():
    api_scope()
    with pytest.raises(store.StoreValidationError):
        store.save_api_form("10.0.0.300", "")
    with pytest.raises(store.StoreValidationError):
        store.save_api_form("", "")
    assert store.get_scope().target_url == "https://api.example.com"


def test_refused_after_approval_and_for_other_templates():
    api_scope()
    store.approve_scope()
    with pytest.raises(store.StoreValidationError):
        store.save_api_form("https://orders.example.org", "")
    assert store.get_scope().target_url == "https://api.example.com"
    store.new_assessment()
    run_to("scope")                                            # the demo URL is a Web URL
    with pytest.raises(store.StoreValidationError, match="API template"):
        store.save_api_form("https://orders.example.org", "")


def test_a_new_target_drops_a_spec_on_another_host(tmp_path):
    api_scope()
    path = tmp_path / "s.json"
    path.write_text(json.dumps(dict(SPEC, servers=[{"url": "https://api.example.com/v1"}])))
    store.save_api_form("https://api.example.com", str(path))
    assert store.get_api_spec() is not None
    store.edit_scope(allowed_methods=["GET"])
    result = store.save_api_form("https://orders.example.org", "")
    assert result.spec_dropped == "s.json" and store.get_api_spec() is None
    assert store.get_assessment().api_schema_digest is None
    assert store.get_scope().allowed_methods == ["GET", "POST"]   # as before the spec
    assert ("api_spec.removed", "s.json (target changed)") in [
        (e.kind, e.detail) for e in store.list_events()]


def test_a_new_target_keeps_a_spec_with_relative_servers(tmp_path):
    api_scope()
    path = tmp_path / "s.json"
    path.write_text(json.dumps(dict(SPEC, servers=[{"url": "/v1"},
                                                    {"url": "https://orders.example.org"}])))
    store.save_api_form("https://api.example.com", str(path))
    assert store.get_api_spec().out_of_scope_servers == ["https://orders.example.org"]
    result = store.save_api_form("https://orders.example.org", "")
    spec = store.get_api_spec()
    assert not result.spec_dropped and spec is not None
    assert spec.servers == ["/v1", "https://orders.example.org"]
    assert spec.out_of_scope_servers == []


def test_an_empty_spec_keeps_the_attached_one(tmp_path):
    api_scope()
    path = tmp_path / "s.json"
    path.write_text(json.dumps(SPEC))
    store.save_api_form("https://api.example.com", str(path))
    result = store.save_api_form("https://api.example.com", "")
    assert not result.spec_attached and result.spec.total == 3


def test_a_refused_spec_leaves_the_target(tmp_path, no_network):
    api_scope()
    with pytest.raises(store.StoreValidationError, match="must be on orders.example.org"):
        store.save_api_form("https://orders.example.org", "https://api.example.com/s.json")
    assert store.get_scope().target_url == "https://api.example.com"


# --- the spec URL, refused before any network ------------------------------------------------
@pytest.mark.parametrize("url, message", [
    ("https://evil.example.net/openapi.json", "The spec URL must be on api.example.com."),
    ("https://api.example.com.evil.example.net/o.json",
     "The spec URL must be on api.example.com."),
    ("http://api.example.com/openapi.json", "The spec URL must use https."),
    ("ftp://api.example.com/openapi.json", "The spec URL must use https."),
    ("file://api.example.com/etc/passwd.json", "The spec URL must use https."),
    ("https://user:pw@api.example.com/openapi.json",
     "The spec URL can't include a user name or password."),
])
def test_spec_urls_refused_without_network(url, message, no_network):
    api_scope()
    with pytest.raises(store.StoreValidationError) as caught:
        store.save_api_form("https://api.example.com", url)
    assert str(caught.value) == message
    assert store.get_api_spec() is None
    assert "api_spec.fetched" not in [e.kind for e in store.list_events()]


# --- the download (a local server) ------------------------------------------------------------
def test_download_ok_logs_host_and_path_only(server):
    api_scope(f"test the API at {server}/v1")
    result = store.save_api_form(server, f"{server}/openapi.json?token={TEST_PASSWORD}")
    assert result.spec_attached and result.spec.total == 3
    assert result.spec.file_name.startswith("127.0.0.1/openapi.json")
    fetched = [e.detail for e in store.list_events() if e.kind == "api_spec.fetched"]
    assert fetched == ["127.0.0.1/openapi.json"]
    assert all(TEST_PASSWORD not in e.detail for e in store.list_events())
    assert TEST_PASSWORD not in json.dumps(store.get_api_spec().__dict__)


def test_base_url_change_and_download_together(server):
    api_scope()                                                 # api.example.com
    result = store.save_api_form(server, f"{server}/openapi")
    assert result.target_changed and result.target_url == server
    assert result.spec.title == "Y" and result.spec.total == 1


def test_a_redirect_is_an_error(server):
    api_scope(f"test the API at {server}/v1")
    with pytest.raises(store.StoreValidationError) as caught:
        store.save_api_form(server, f"{server}/redirect.json")
    assert str(caught.value) == "Couldn't download the spec: the server redirected it (HTTP 302)."
    assert _Handler.seen == ["/redirect.json"]                 # the redirect was not followed
    assert store.get_api_spec() is None


@pytest.mark.parametrize("route", ["/big.json", "/stream.json"])
def test_too_large_is_an_error(server, route):
    api_scope(f"test the API at {server}/v1")
    with pytest.raises(store.StoreValidationError) as caught:
        store.save_api_form(server, f"{server}{route}")
    assert str(caught.value) == "Couldn't download the spec: it is over 5 MB."


def test_a_timeout_is_an_error(server, monkeypatch):
    monkeypatch.setattr(openapi_fetch, "FETCH_TIMEOUT", 0.3)
    api_scope(f"test the API at {server}/v1")
    with pytest.raises(store.StoreValidationError) as caught:
        store.save_api_form(server, f"{server}/slow.json")
    assert str(caught.value) == "Couldn't download the spec: no answer within 0.3 s."


def test_an_http_error_and_wrong_content(server):
    api_scope(f"test the API at {server}/v1")
    with pytest.raises(store.StoreValidationError) as caught:
        store.save_api_form(server, f"{server}/missing.json")
    assert str(caught.value) == "Couldn't download the spec: the server answered HTTP 404."
    with pytest.raises(store.StoreValidationError, match="not valid JSON"):
        store.save_api_form(server, f"{server}/page.json")
    assert store.get_api_spec() is None
    assert store.get_scope().target_url == server


def test_attach_api_spec_takes_a_url_too(server):
    api_scope(f"test the API at {server}/v1")
    assert store.attach_api_spec(f"{server}/openapi.json").total == 3
