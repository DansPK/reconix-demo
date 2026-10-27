"""The scope manifest in plain words (store.describe_scope) and on the Template screen."""

import pytest

from reconix import store
from reconix.widgets import ScopeManifestView

from .support import SIZE, run_to, start_demo

# (request, headline start, the access line in "What it may do", never-touch paths)
CASES = [
    (store.DEMO_REQUEST, "Reconix will test https://staging.example.com as a web application.",
     "Send only GET and POST requests", ["/admin"]),
    ("Test the API at https://api.example.com/v1", "Reconix will test https://api.example.com",
     "Send only GET and POST requests", ["/internal", "/admin"]),
    ("scan 10.0.0.0/24", "Reconix will test 10.0.0.0/24 as a network.",
     "Only connect to ports 22, 80, 443, 8080 and 8443, using TCP connect", []),
    ("review github.com/acme/app", "Reconix will review github.com/acme/app as source code.",
     "Only read the files; nothing is run", [".git", "node_modules", "vendor", "secrets"]),
]


@pytest.mark.parametrize("request_text, headline, access, never", CASES)
def test_each_template_reads_as_plain_language(request_text, headline, access, never):
    run_to("scope", request_text)
    summary = store.describe_scope(store.get_scope())
    assert summary.headline.startswith(headline)
    assert access in summary.may_do
    assert summary.never == never
    assert summary.tools == store.get_scope().tools
    words = " ".join([summary.headline, *summary.may_do, *summary.never])
    assert "minute" not in words                                 # the time limit isn't shown
    assert not any(key in words for key in ("allowed_", "excluded_", "time_limit"))


def test_an_edit_shows_up_in_the_words():
    run_to("scope")
    store.edit_scope(allowed_methods=["GET", "HEAD", "POST"], excluded_paths=["/admin", "/ops"])
    summary = store.describe_scope(store.get_scope())
    assert "Send only GET, HEAD and POST requests" in summary.may_do
    assert summary.never == ["/admin", "/ops"]


async def test_the_template_screen_shows_no_json(app):
    async with app.run_test(size=SIZE) as pilot:
        await start_demo(pilot)
        shown = str(app.screen.query_one(ScopeManifestView).render())
        assert "What it may do" in shown and "What it will never touch" in shown
        assert "{" not in shown and '"' not in shown and "allowed_" not in shown
        assert "minutes" not in shown
